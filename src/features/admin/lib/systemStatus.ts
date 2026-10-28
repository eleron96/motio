// Types and pure helpers for the admin "System" section. The status itself is
// assembled by the admin Edge Function (action system.status).

export type SystemServiceKey = 'gateway' | 'database' | 'auth' | 'storage' | 'realtime' | 'keycloak' | 'backup';

export interface SystemStatus {
  services: Array<{ key: SystemServiceKey; ok: boolean; ms: number | null }>;
  latestRelease: { tag: string; url: string; publishedAt: string | null } | null;
  updateCheck: 'disabled' | 'ok' | 'unavailable';
  selfHosted: boolean;
  configured: { email: boolean; push: boolean; errorTracking: boolean };
}

export type TestEmailResult =
  | { status: 'sent' }
  | { status: 'not_configured' }
  | { status: 'throttled'; retryAfterSeconds: number }
  | { status: 'failed'; message: string };

const parseVersion = (value: string): number[] | null => {
  const match = value.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1, 4).map(Number) : null;
};

/** True when `latestTag` (e.g. "v0.11.0") is newer than the running `current` version. */
export const isNewerVersion = (current: string, latestTag: string): boolean => {
  const a = parseVersion(current);
  const b = parseVersion(latestTag);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index += 1) {
    if (b[index] !== a[index]) return b[index] > a[index];
  }
  return false;
};
