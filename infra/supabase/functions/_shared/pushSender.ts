// Web Push transport, implemented directly on WebCrypto (RFC 8291 aes128gcm
// payload encryption + RFC 8292 VAPID). No external dependency on purpose:
//   * npm:web-push relies on Node's crypto and fails under the Deno edge-runtime
//     ("Invalid PEM label" when signing the VAPID JWT);
//   * a dependency-free implementation also removes a cold-start fetch, avoiding
//     the esm.sh/jsr routing fragility this stack has hit before.
// WebCrypto is identical in Deno and Node, so this is validated locally before
// shipping. VAPID keys are the standard base64url pair from `web-push
// generate-vapid-keys`.

const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@motio.app";

const encoder = new TextEncoder();

export const isPushConfigured = () => Boolean(vapidPublicKey && vapidPrivateKey);

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendResult {
  ok: boolean;
  // 404/410 from the push service means the subscription is dead and should be
  // pruned from the table so we stop trying to deliver to it.
  gone: boolean;
  status?: number;
  error?: string;
}

const b64urlToBytes = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const bytesToB64url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const concatBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const hkdf = async (
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HKDF" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
};

// Cache the imported VAPID signing key: it is endpoint-independent, only the
// JWT audience changes per push service.
let signingKeyPromise: Promise<CryptoKey> | null = null;
const getSigningKey = (): Promise<CryptoKey> => {
  if (!signingKeyPromise) {
    const pub = b64urlToBytes(vapidPublicKey);
    const jwk: JsonWebKey = {
      kty: "EC",
      crv: "P-256",
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      d: vapidPrivateKey,
      ext: true,
    };
    signingKeyPromise = crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }
  return signingKeyPromise;
};

const buildVapidJwt = async (endpoint: string): Promise<string> => {
  const audience = new URL(endpoint).origin;
  const segment = (obj: unknown) => bytesToB64url(encoder.encode(JSON.stringify(obj)));
  const signingInput = segment({ typ: "JWT", alg: "ES256" })
    + "." + segment({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapidSubject });
  const key = await getSigningKey();
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(signingInput)),
  );
  return `${signingInput}.${bytesToB64url(signature)}`;
};

// RFC 8291: derive the content key/nonce from the ECDH secret and encrypt the
// payload as a single aes128gcm record.
const encryptPayload = async (
  p256dh: string,
  authSecretB64: string,
  plaintext: Uint8Array,
): Promise<Uint8Array> => {
  const uaPublic = b64urlToBytes(p256dh);
  const authSecret = b64urlToBytes(authSecretB64);

  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  ) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephemeral.privateKey, 256),
  );

  const keyInfo = concatBytes(encoder.encode("WebPush: info"), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, concatBytes(encoder.encode("Content-Encoding: aes128gcm"), new Uint8Array([0])), 16);
  const nonce = await hkdf(ikm, salt, concatBytes(encoder.encode("Content-Encoding: nonce"), new Uint8Array([0])), 12);

  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  // 0x02 marks the last (only) record per RFC 8188 padding delimiter.
  const record = concatBytes(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cekKey, record),
  );

  const recordSize = 4096;
  const rsBytes = new Uint8Array([
    (recordSize >>> 24) & 255,
    (recordSize >>> 16) & 255,
    (recordSize >>> 8) & 255,
    recordSize & 255,
  ]);
  // aes128gcm header: salt(16) | rs(4) | idlen(1) | keyid(as_public, 65)
  const header = concatBytes(salt, rsBytes, new Uint8Array([asPublic.length]), asPublic);
  return concatBytes(header, ciphertext);
};

export const sendWebPush = async (
  sub: PushSubscriptionRecord,
  payload: Record<string, unknown>,
): Promise<PushSendResult> => {
  try {
    const jwt = await buildVapidJwt(sub.endpoint);
    const body = await encryptPayload(sub.p256dh, sub.auth, encoder.encode(JSON.stringify(payload)));

    const response = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        TTL: "86400",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
      },
      body,
    });

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, gone: false, status: response.status };
    }
    const gone = response.status === 404 || response.status === 410;
    const text = await response.text().catch(() => "");
    return { ok: false, gone, status: response.status, error: text.slice(0, 300) };
  } catch (err) {
    return { ok: false, gone: false, error: String((err as Error).message ?? err) };
  }
};
