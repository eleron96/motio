/**
 * Product email transport for edge functions.
 *
 * Sends transactional product mail (welcome email, future digests) over the
 * same SMTP account Keycloak uses for auth mail — credentials arrive via
 * MAILER_* env vars mapped from GOTRUE_SMTP_* in docker-compose.
 *
 * Modes:
 *   - Dry run (MAILER_DRY_RUN=1, or SMTP host missing, e.g. local dev):
 *     renders and logs instead of sending, reports { dryRun: true }.
 *   - Real send: implicit-TLS SMTP (port 465) via denomailer.
 */
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export interface MailerConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  dryRun: boolean;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra SMTP headers, e.g. List-Unsubscribe for the mailbox-native button. */
  headers?: Record<string, string>;
}

export const getMailerConfig = (): MailerConfig => {
  const host = Deno.env.get("MAILER_SMTP_HOST") ?? "";
  const port = Number(Deno.env.get("MAILER_SMTP_PORT") ?? "465");
  const dryRunFlag = (Deno.env.get("MAILER_DRY_RUN") ?? "") === "1";
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 465,
    username: Deno.env.get("MAILER_SMTP_USER") ?? "",
    password: Deno.env.get("MAILER_SMTP_PASS") ?? "",
    fromEmail: Deno.env.get("MAILER_FROM_EMAIL") ?? "",
    fromName: Deno.env.get("MAILER_FROM_NAME") ?? "Motio",
    // Missing host means "nowhere to send" (local dev) — degrade to dry run
    // instead of erroring so the calling flow never breaks sign-in.
    dryRun: dryRunFlag || host.length === 0,
  };
};

export const sendEmail = async (
  config: MailerConfig,
  email: OutgoingEmail,
): Promise<{ dryRun: boolean }> => {
  if (config.dryRun) {
    console.log(
      `[mailer] dry run: would send "${email.subject}" to ${email.to} from ${config.fromEmail}`,
    );
    return { dryRun: true };
  }

  const client = new SMTPClient({
    connection: {
      hostname: config.host,
      port: config.port,
      tls: true,
      auth: {
        username: config.username,
        password: config.password,
      },
    },
  });

  try {
    await client.send({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: email.to,
      subject: email.subject,
      content: email.text,
      html: email.html,
      ...(email.headers ? { headers: email.headers } : {}),
    });
  } finally {
    try {
      await client.close();
    } catch (_closeError) {
      // Delivery already succeeded or failed above; a close() hiccup is noise.
    }
  }

  return { dryRun: false };
};

// ── One-click unsubscribe ────────────────────────────────────────────────
// The link in every broadcast email carries an HMAC over the user id, keyed
// by the service-role key (already in the function env; the signature does
// not reveal it). A valid signature IS the authorization — no login needed
// to unsubscribe from an inbox.

const unsubscribeKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const hmacHex = async (message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(unsubscribeKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const buildUnsubscribeSignature = (userId: string) => hmacHex(`unsubscribe:${userId}`);

export const verifyUnsubscribeSignature = async (userId: string, signature: string) => {
  const expected = await buildUnsubscribeSignature(userId);
  if (expected.length !== signature.length) return false;
  // Constant-time compare — don't leak prefix matches through timing.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
};

export const buildUnsubscribeUrl = async (appUrl: string, userId: string) => {
  const signature = await buildUnsubscribeSignature(userId);
  return `${appUrl.replace(/\/$/, "")}/functions/v1/mailer?action=unsubscribe&uid=${encodeURIComponent(userId)}&sig=${signature}`;
};

/**
 * Diagnostic: open a TLS connection to the configured SMTP host and read the
 * server greeting. Proves runtime TCP/TLS support and host reachability
 * without sending anything.
 */
export const checkSmtpConnection = async (
  config: MailerConfig,
): Promise<{ greeting: string }> => {
  const conn = await Deno.connectTls({
    hostname: config.host,
    port: config.port,
  });
  try {
    const buffer = new Uint8Array(512);
    const bytesRead = (await conn.read(buffer)) ?? 0;
    const greeting = new TextDecoder().decode(buffer.subarray(0, bytesRead)).trim();
    return { greeting };
  } finally {
    conn.close();
  }
};
