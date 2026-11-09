// Types and pure helpers for the admin "System" section. The status itself is
// assembled by the admin Edge Function (action system.status).

export type SystemServiceKey = 'gateway' | 'database' | 'auth' | 'storage' | 'realtime' | 'keycloak' | 'backup';

export interface SystemStatus {
  services: Array<{ key: SystemServiceKey; ok: boolean; ms: number | null }>;
  latestRelease: { tag: string; url: string; publishedAt: string | null } | null;
  updateCheck: 'disabled' | 'ok' | 'unavailable';
  selfHosted: boolean;
  configured: {
    email: boolean;
    // Why email is off; missing on servers older than this field.
    emailOffReason?: EmailOffReason | null;
    push: boolean;
    errorTracking: boolean;
  };
}

// no_host: no SMTP server at all; dry_run_flag: MAILER_DRY_RUN=1 although one is set.
export type EmailOffReason = 'no_host' | 'dry_run_flag';

export type TestEmailResult =
  | { status: 'sent' }
  | { status: 'not_configured'; reason?: EmailOffReason }
  | { status: 'throttled'; retryAfterSeconds: number }
  | { status: 'failed'; message: string };

export { isNewerVersion } from '@/shared/domain/versionCompare';
