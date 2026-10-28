// Admin "System" section: read-only status of this install and a test email.
// Nothing here can change the server — updates stay a command on the host
// (infra/scripts/install.sh update), see docs/self-hosting.md.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getMailerConfig, sendEmail } from "../_shared/mailer.ts";
import {
  createTestEmailThrottle,
  describeMailError,
  isUpdateCheckEnabled,
  parseLatestRelease,
  type LatestRelease,
  type ServiceCheck,
  type SystemServiceKey,
  type SystemStatus,
} from "../_shared/systemStatus.ts";

const CHECK_TIMEOUT_MS = 3000;
const RELEASE_CACHE_MS = 6 * 60 * 60 * 1000;
const RELEASES_URL = "https://api.github.com/repos/eleron96/motio/releases/latest";

let releaseCache: { at: number; release: LatestRelease | null; ok: boolean } | null = null;
const throttleTestEmail = createTestEmailThrottle();

const timed = async (key: SystemServiceKey, probe: () => Promise<boolean>): Promise<ServiceCheck> => {
  const started = Date.now();
  try {
    const ok = await probe();
    return { key, ok, ms: Date.now() - started };
  } catch (_error) {
    return { key, ok: false, ms: null };
  }
};

// Every HTTP probe goes through the gateway (SUPABASE_URL inside the stack),
// so the check also proves the routing users rely on.
const httpOk = (url: string, accept: (status: number) => boolean = (status) => status < 400) =>
  async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    await response.body?.cancel();
    return accept(response.status);
  };

const latestRelease = async (): Promise<{ release: LatestRelease | null; ok: boolean }> => {
  if (releaseCache && Date.now() - releaseCache.at < RELEASE_CACHE_MS) return releaseCache;
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "motio-update-check" },
      signal: AbortSignal.timeout(5000),
    });
    const release = response.ok ? parseLatestRelease(await response.json()) : null;
    releaseCache = { at: Date.now(), release, ok: Boolean(release) };
  } catch (_error) {
    // Keep a failed answer for a short while only, so a network blip heals soon.
    releaseCache = { at: Date.now() - RELEASE_CACHE_MS + 10 * 60 * 1000, release: null, ok: false };
  }
  return releaseCache;
};

export const getSystemStatus = async (
  supabaseAdmin: SupabaseClient,
  supabaseUrl: string,
  keycloakBaseUrl: string,
  keycloakRealm: string,
): Promise<SystemStatus> => {
  const base = supabaseUrl.replace(/\/+$/, "");
  const updateCheckOn = isUpdateCheckEnabled(Deno.env.get("MOTIO_UPDATE_CHECK"));

  const [services, release] = await Promise.all([
    Promise.all([
      timed("gateway", httpOk(`${base}/health`)),
      timed("database", async () => {
        const { error } = await supabaseAdmin
          .from("workspaces")
          .select("id", { head: true, count: "exact" })
          .limit(1)
          .abortSignal(AbortSignal.timeout(CHECK_TIMEOUT_MS));
        return !error;
      }),
      timed("auth", httpOk(`${base}/auth/v1/health`)),
      timed("storage", httpOk(`${base}/storage/v1/status`)),
      // Realtime answers its own routes only; any HTTP reply (even 404) means it is up.
      timed("realtime", httpOk(`${base}/realtime/v1/`, (status) => status < 500)),
      timed(
        "keycloak",
        httpOk(`${keycloakBaseUrl.replace(/\/+$/, "")}/realms/${encodeURIComponent(keycloakRealm)}/.well-known/openid-configuration`),
      ),
      timed("backup", httpOk(`${base}/backup/health`)),
    ]),
    updateCheckOn ? latestRelease() : Promise.resolve(null),
  ]);

  const mailer = getMailerConfig();
  return {
    services,
    latestRelease: release?.release ?? null,
    updateCheck: !updateCheckOn ? "disabled" : release?.ok ? "ok" : "unavailable",
    selfHosted: (Deno.env.get("MOTIO_SELF_HOSTED") ?? "") === "true",
    configured: {
      email: !mailer.dryRun,
      push: Boolean(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY")),
      errorTracking: Boolean(Deno.env.get("GLITCHTIP_DSN")),
    },
  };
};

export type TestEmailResult =
  | { status: "sent" }
  | { status: "not_configured" }
  | { status: "throttled"; retryAfterSeconds: number }
  | { status: "failed"; message: string };

export const sendTestEmail = async (userId: string, email: string | undefined): Promise<TestEmailResult> => {
  const config = getMailerConfig();
  if (config.dryRun) return { status: "not_configured" };
  if (!email) return { status: "failed", message: "this account has no email address" };

  const wait = throttleTestEmail(userId);
  if (wait > 0) return { status: "throttled", retryAfterSeconds: wait };

  try {
    await sendEmail(config, {
      to: email,
      subject: "Motio: test email",
      text: "This is a test email from the System section of the Motio admin console. Email works.",
      html: "<p>This is a test email from the <strong>System</strong> section of the Motio admin console.</p><p>Email works.</p>",
    });
    console.info(JSON.stringify({ module: "admin.system", action: "testEmail", result: "success" }));
    return { status: "sent" };
  } catch (error) {
    const message = describeMailError(error, config.password);
    console.error(JSON.stringify({ module: "admin.system", action: "testEmail", result: "error", message }));
    return { status: "failed", message };
  }
};
