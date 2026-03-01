import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOauth2ProxySignOutPath } from '@/features/auth/store/authStore';

describe('auth store sign-out path', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_OAUTH2_PROXY_SIGN_OUT_PATH', '/oauth2/sign_out');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds oauth2 sign-out redirect through keycloak end-session', () => {
    vi.stubEnv('VITE_KEYCLOAK_PUBLIC_URL', 'http://localhost:8081');
    vi.stubEnv('VITE_KEYCLOAK_REALM', 'timeline');
    vi.stubEnv('VITE_KEYCLOAK_CLIENT_ID', 'timeline-supabase');

    const signOutPath = getOauth2ProxySignOutPath();
    const [rawPath, rawQuery = ''] = signOutPath.split('?', 2);
    const query = new URLSearchParams(rawQuery);
    const rd = query.get('rd');

    expect(rawPath).toBe('/oauth2/sign_out');
    expect(rd).toBeTruthy();

    const endSessionUrl = new URL(rd!);
    expect(endSessionUrl.origin).toBe('http://localhost:8081');
    expect(endSessionUrl.pathname).toBe('/realms/timeline/protocol/openid-connect/logout');
    expect(endSessionUrl.searchParams.get('client_id')).toBe('timeline-supabase');
    expect(endSessionUrl.searchParams.get('post_logout_redirect_uri')).toBe(`${window.location.origin}/auth?silent=1`);
  });

  it('falls back to /auth?silent=1 when keycloak config is incomplete', () => {
    vi.stubEnv('VITE_KEYCLOAK_PUBLIC_URL', '');
    vi.stubEnv('VITE_KEYCLOAK_REALM', '');
    vi.stubEnv('VITE_KEYCLOAK_CLIENT_ID', '');

    const signOutPath = getOauth2ProxySignOutPath();
    const [, rawQuery = ''] = signOutPath.split('?', 2);
    const query = new URLSearchParams(rawQuery);

    expect(query.get('rd')).toBe('/auth?silent=1');
  });
});
