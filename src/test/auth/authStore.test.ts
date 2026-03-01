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

  it('redirects to /auth?silent=1 after oauth2 sign-out', () => {
    const signOutPath = getOauth2ProxySignOutPath();
    const [rawPath, rawQuery = ''] = signOutPath.split('?', 2);
    const query = new URLSearchParams(rawQuery);

    expect(rawPath).toBe('/oauth2/sign_out');
    expect(query.get('rd')).toBe('/auth?silent=1');
  });

  it('preserves existing sign-out query params while overriding rd', () => {
    vi.stubEnv('VITE_OAUTH2_PROXY_SIGN_OUT_PATH', '/oauth2/sign_out?foo=bar&rd=/old');

    const signOutPath = getOauth2ProxySignOutPath();
    const [rawPath, rawQuery = ''] = signOutPath.split('?', 2);
    const query = new URLSearchParams(rawQuery);

    expect(rawPath).toBe('/oauth2/sign_out');
    expect(query.get('foo')).toBe('bar');
    expect(query.get('rd')).toBe('/auth?silent=1');
  });
});
