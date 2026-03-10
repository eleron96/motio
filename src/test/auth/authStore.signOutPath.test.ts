import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOauth2ProxySignOutPath } from '@/features/auth/store/authStore';

describe('getOauth2ProxySignOutPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns /oauth2/sign_out with rd=/ when env is not set', () => {
    const result = getOauth2ProxySignOutPath();
    const [path, query] = result.split('?');
    const params = new URLSearchParams(query);

    expect(path).toBe('/oauth2/sign_out');
    expect(params.get('rd')).toBe('/');
  });

  it('uses custom VITE_OAUTH2_PROXY_SIGN_OUT_PATH from env', () => {
    vi.stubEnv('VITE_OAUTH2_PROXY_SIGN_OUT_PATH', '/custom/sign_out');
    const result = getOauth2ProxySignOutPath();
    const [path, query] = result.split('?');
    const params = new URLSearchParams(query);

    expect(path).toBe('/custom/sign_out');
    expect(params.get('rd')).toBe('/');
  });

  it('overrides any existing rd param already present in the custom path', () => {
    vi.stubEnv('VITE_OAUTH2_PROXY_SIGN_OUT_PATH', '/oauth2/sign_out?rd=%2Fother-page');
    const result = getOauth2ProxySignOutPath();
    const params = new URLSearchParams(result.split('?')[1] ?? '');

    expect(params.get('rd')).toBe('/');
  });

  it('preserves other query params already in the custom path alongside rd', () => {
    vi.stubEnv('VITE_OAUTH2_PROXY_SIGN_OUT_PATH', '/oauth2/sign_out?foo=bar');
    const result = getOauth2ProxySignOutPath();
    const params = new URLSearchParams(result.split('?')[1] ?? '');

    expect(params.get('foo')).toBe('bar');
    expect(params.get('rd')).toBe('/');
  });

  it('falls back to /oauth2/sign_out without rd when env is whitespace only', () => {
    vi.stubEnv('VITE_OAUTH2_PROXY_SIGN_OUT_PATH', '   ');
    const result = getOauth2ProxySignOutPath();

    // Early-exit path: whitespace trims to empty, returns bare fallback without rd.
    expect(result).toBe('/oauth2/sign_out');
  });
});
