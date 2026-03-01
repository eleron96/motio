import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRecentSignOut,
  consumeRecentSignOut,
  markRecentSignOut,
} from '@/features/auth/lib/recentSignOut';

const RECENT_SIGN_OUT_KEY = 'motio_recent_sign_out_at';
const RECENT_SIGN_OUT_TTL_MS = 5 * 60 * 1000;

describe('recent sign out marker', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('consumes a fresh marker once', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    markRecentSignOut();
    vi.spyOn(Date, 'now').mockReturnValue(1_500);

    expect(consumeRecentSignOut()).toBe(true);
    expect(consumeRecentSignOut()).toBe(false);
  });

  it('expires marker after ttl', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    markRecentSignOut();
    vi.spyOn(Date, 'now').mockReturnValue(2_000 + RECENT_SIGN_OUT_TTL_MS + 1);

    expect(consumeRecentSignOut()).toBe(false);
  });

  it('clears marker explicitly', () => {
    markRecentSignOut();
    clearRecentSignOut();

    expect(consumeRecentSignOut()).toBe(false);
  });

  it('ignores malformed marker', () => {
    window.sessionStorage.setItem(RECENT_SIGN_OUT_KEY, 'bad-value');

    expect(consumeRecentSignOut()).toBe(false);
  });
});
