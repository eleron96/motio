import { describe, expect, it } from 'vitest';
import {
  buildAuthPath,
  getAuthRecoveryPath,
  getRedirectTargetFromSearch,
} from '@/features/auth/lib/authRedirect';

describe('auth redirect helpers', () => {
  it('reads safe redirect target from search params', () => {
    expect(getRedirectTargetFromSearch('?redirect=%2Fapp')).toBe('/app');
  });

  it('rejects unsafe redirect target from search params', () => {
    expect(getRedirectTargetFromSearch('?redirect=https%3A%2F%2Fevil.com')).toBeNull();
    expect(getRedirectTargetFromSearch('?redirect=%2F%2Fevil.com')).toBeNull();
  });

  // Browsers read "\" as "/" and drop tabs and newlines, so each of these
  // leads to another site, though it starts with a single "/".
  it.each([
    ['backslash after the slash', '/\\evil.example'],
    ['backslash then slash', '/\\/evil.example'],
    ['tab between the slashes', '/\t/evil.example'],
    ['newline between the slashes', '/\n/evil.example'],
    ['carriage return between the slashes', '/\r/evil.example'],
    ['backslash with a path', '/\\evil.example/app?x=1'],
  ])('rejects a target that leaves the site: %s', (_label, target) => {
    expect(getRedirectTargetFromSearch(`?redirect=${encodeURIComponent(target)}`)).toBeNull();
  });

  it('rejects targets that are not a path', () => {
    expect(getRedirectTargetFromSearch('?redirect=javascript%3Aalert(1)')).toBeNull();
    expect(getRedirectTargetFromSearch('?redirect=%5C%5Cevil.example')).toBeNull();
    expect(getRedirectTargetFromSearch('?redirect=app')).toBeNull();
    expect(getRedirectTargetFromSearch('?redirect=')).toBeNull();
    expect(getRedirectTargetFromSearch('')).toBeNull();
  });

  it('keeps the query and the hash of a path on this site', () => {
    expect(getRedirectTargetFromSearch(`?redirect=${encodeURIComponent('/app/projects?tab=contacts#top')}`))
      .toBe('/app/projects?tab=contacts#top');
    expect(getRedirectTargetFromSearch(`?redirect=${encodeURIComponent('/invite/abc-123')}`))
      .toBe('/invite/abc-123');
  });

  it('returns the path as the browser will read it', () => {
    // An encoded backslash stays part of the path on this site.
    expect(getRedirectTargetFromSearch(`?redirect=${encodeURIComponent('/%5Cevil.example')}`))
      .toBe('/%5Cevil.example');
    expect(getRedirectTargetFromSearch(`?redirect=${encodeURIComponent('/app/../app/settings')}`))
      .toBe('/app/settings');
  });

  it('builds auth path with encoded redirect target', () => {
    expect(buildAuthPath('/app?tab=dashboard')).toBe('/auth?redirect=%2Fapp%3Ftab%3Ddashboard');
    expect(buildAuthPath(null)).toBe('/auth');
  });

  it('recovers auth path from callback URL params', () => {
    expect(getAuthRecoveryPath('?code=abc&state=qwe&redirect=%2Fapp')).toBe('/auth?redirect=%2Fapp');
    expect(getAuthRecoveryPath('?code=abc')).toBe('/auth');
  });
});
