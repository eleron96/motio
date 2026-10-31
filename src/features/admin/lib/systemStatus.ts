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

export { isNewerVersion } from '@/shared/domain/versionCompare';
