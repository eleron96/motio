/**
 * Pieces of the admin "System" section (actions system.status /
 * system.testEmail) that need no I/O: the shape of the answer, the release
 * reply from GitHub and the throttle for test emails. Unit-tested from vitest
 * (src/test/shared/systemStatus.test.ts).
 */

export const SYSTEM_SERVICE_KEYS = [
  "gateway",
  "database",
  "auth",
  "storage",
  "realtime",
  "keycloak",
  "backup",
] as const;

export type SystemServiceKey = (typeof SYSTEM_SERVICE_KEYS)[number];

export interface ServiceCheck {
  key: SystemServiceKey;
  ok: boolean;
  /** Round trip in milliseconds; null when the request never completed. */
  ms: number | null;
}

export interface LatestRelease {
  tag: string;
  url: string;
  publishedAt: string | null;
}

export interface SystemStatus {
  services: ServiceCheck[];
  latestRelease: LatestRelease | null;
  /** "disabled" (MOTIO_UPDATE_CHECK=false), "ok", or "unavailable" (no answer). */
  updateCheck: "disabled" | "ok" | "unavailable";
  selfHosted: boolean;
  /** Server-side settings as yes/no only — never their values. */
  configured: {
    email: boolean;
    push: boolean;
    errorTracking: boolean;
  };
}

/** The release from GitHub's "latest release" reply, or null if it is not one. */
export const parseLatestRelease = (body: unknown): LatestRelease | null => {
  if (!body || typeof body !== "object") return null;
  const release = body as Record<string, unknown>;
  const tag = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
  const url = typeof release.html_url === "string" ? release.html_url : "";
  if (!/^v?\d+\.\d+\.\d+$/.test(tag) || !url.startsWith("https://github.com/")) return null;
  return {
    tag,
    url,
    publishedAt: typeof release.published_at === "string" ? release.published_at : null,
  };
};

/** "false", "0", "no", "off" (any case) turn the update check off; anything else keeps it on. */
export const isUpdateCheckEnabled = (value: string | undefined): boolean =>
  !["false", "0", "no", "off"].includes((value ?? "").trim().toLowerCase());

/**
 * One test email per admin per window. Returns the seconds to wait, or 0 when
 * a send is allowed now (and records it).
 */
export const createTestEmailThrottle = (windowMs = 60_000) => {
  const lastSent = new Map<string, number>();
  return (userId: string, now = Date.now()): number => {
    const previous = lastSent.get(userId);
    if (previous !== undefined && now - previous < windowMs) {
      return Math.ceil((windowMs - (now - previous)) / 1000);
    }
    lastSent.set(userId, now);
    return 0;
  };
};

/** A mail error short enough to show and without anything that looks like a secret. */
export const describeMailError = (error: unknown, password: string): string => {
  const raw = error instanceof Error ? error.message : String(error);
  const scrubbed = password ? raw.split(password).join("***") : raw;
  return scrubbed.replace(/\s+/g, " ").trim().slice(0, 200) || "unknown error";
};
