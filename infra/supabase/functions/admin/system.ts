// Admin "System" section: read-only status of this install and a test email.
// Nothing here can change the server — updates stay a command on the host
// (infra/scripts/install.sh update), see docs/self-hosting.md.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { getMailerConfig, sendEmail, type MailerConfig } from "../_shared/mailer.ts";
import {
  createTestEmailThrottle,
  describeMailError,
  isUpdateCheckEnabled,
  parseReleaseList,
  type ReleaseInfo,
  type UpdateInfo,
  type EmailOffReason,
  type ServiceCheck,
  type SystemServiceKey,
  type SystemStatus,
} from "../_shared/systemStatus.ts";

const CHECK_TIMEOUT_MS = 3000;
const RELEASE_CACHE_MS = 6 * 60 * 60 * 1000;
// One page of releases, not just the latest: an install several releases behind
// is shown the notes of every release it skipped.
const RELEASES_URL = "https://api.github.com/repos/eleron96/motio/releases?per_page=30";

let releaseCache: { at: number; releases: ReleaseInfo[]; ok: boolean } | null = null;
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

const publishedReleases = async (): Promise<{ releases: ReleaseInfo[]; ok: boolean }> => {
  if (releaseCache && Date.now() - releaseCache.at < RELEASE_CACHE_MS) return releaseCache;
  let releases: ReleaseInfo[] = [];
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "motio-update-check" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) releases = parseReleaseList(await response.json());
    else await response.body?.cancel();
  } catch (_error) {
    releases = [];
  }
  const ok = releases.length > 0;
  // Keep a failed answer for a short while only, so a network blip heals soon.
  const at = ok ? Date.now() : Date.now() - RELEASE_CACHE_MS + 10 * 60 * 1000;
  releaseCache = { at, releases, ok };
  return releaseCache;
};

const isSelfHosted = () => (Deno.env.get("MOTIO_SELF_HOSTED") ?? "") === "true";

/**
 * What the "update available" mark of the admin console needs, and nothing
 * else: no service is probed, so every console page can ask for it.
 */
export const getUpdateInfo = async (): Promise<UpdateInfo> => {
  const updateCheckOn = isUpdateCheckEnabled(Deno.env.get("MOTIO_UPDATE_CHECK"));
  const published = updateCheckOn ? await publishedReleases() : null;
  return {
    updateCheck: !updateCheckOn ? "disabled" : published?.ok ? "ok" : "unavailable",
    selfHosted: isSelfHosted(),
    releases: published?.releases ?? [],
  };
};

export const getSystemStatus = async (
  supabaseAdmin: SupabaseClient,
  supabaseUrl: string,
  keycloakBaseUrl: string,
  keycloakRealm: string,
): Promise<SystemStatus> => {
  const base = supabaseUrl.replace(/\/+$/, "");
  const updateCheckOn = isUpdateCheckEnabled(Deno.env.get("MOTIO_UPDATE_CHECK"));

  const [services, published] = await Promise.all([
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
    updateCheckOn ? publishedReleases() : Promise.resolve(null),
  ]);

  const mailer = getMailerConfig();
  return {
    services,
    latestRelease: latestOf(published?.releases ?? []),
    updateCheck: !updateCheckOn ? "disabled" : published?.ok ? "ok" : "unavailable",
    selfHosted: isSelfHosted(),
    configured: {
      email: !mailer.dryRun,
      // Why Motio's own emails are off: no SMTP server at all, or MAILER_DRY_RUN=1
      // although one is set (an install made without email keeps that flag).
      emailOffReason: emailOffReason(mailer),
      push: Boolean(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY")),
      errorTracking: Boolean(Deno.env.get("GLITCHTIP_DSN")),
    },
  };
};

const latestOf = (releases: ReleaseInfo[]) => {
  const latest = releases[0];
  return latest ? { tag: latest.tag, url: latest.url, publishedAt: latest.publishedAt } : null;
};

const emailOffReason = (mailer: MailerConfig): EmailOffReason | null => {
  if (!mailer.dryRun) return null;
  return mailer.host ? "dry_run_flag" : "no_host";
};

export type TestEmailResult =
  | { status: "sent" }
  | { status: "not_configured"; reason: EmailOffReason }
  | { status: "throttled"; retryAfterSeconds: number }
  | { status: "failed"; message: string };

export const sendTestEmail = async (userId: string, email: string | undefined): Promise<TestEmailResult> => {
  const config = getMailerConfig();
  if (config.dryRun) return { status: "not_configured", reason: emailOffReason(config) ?? "no_host" };
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
