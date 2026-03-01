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

  it('builds auth path with encoded redirect target', () => {
    expect(buildAuthPath('/app?tab=dashboard')).toBe('/auth?redirect=%2Fapp%3Ftab%3Ddashboard');
    expect(buildAuthPath(null)).toBe('/auth');
  });

  it('recovers auth path from callback URL params', () => {
    expect(getAuthRecoveryPath('?code=abc&state=qwe&redirect=%2Fapp')).toBe('/auth?redirect=%2Fapp');
    expect(getAuthRecoveryPath('?code=abc')).toBe('/auth');
  });
});
