import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_SESSION_SYNC_STORAGE_KEY,
  broadcastAuthSessionSync,
  getAuthSessionStateFromStorageEvent,
  isAuthSessionSyncStorageEvent,
  isSupabaseAuthStorageKey,
  parseAuthSessionSyncPayload,
} from '@/features/auth/lib/authSessionSync';

describe('auth session sync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('writes valid signed-in payload to local storage', () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    broadcastAuthSessionSync('signed-in');

    const payload = parseAuthSessionSyncPayload(window.localStorage.getItem(AUTH_SESSION_SYNC_STORAGE_KEY));
    expect(payload).not.toBeNull();
    expect(payload?.state).toBe('signed-in');
    expect(payload?.at).toBe(10_000);
    expect(typeof payload?.source).toBe('string');
    expect(payload?.source.length).toBeGreaterThan(0);
  });

  it('parses invalid payload as null', () => {
    expect(parseAuthSessionSyncPayload('bad-json')).toBeNull();
    expect(parseAuthSessionSyncPayload(JSON.stringify({ state: 'unknown' }))).toBeNull();
    expect(parseAuthSessionSyncPayload(null)).toBeNull();
  });

  it('detects storage event key for auth sync marker', () => {
    const event = new StorageEvent('storage', {
      key: AUTH_SESSION_SYNC_STORAGE_KEY,
      newValue: JSON.stringify({
        state: 'signed-out',
        at: 1_000,
        source: 'tab-a',
      }),
    });
    expect(isAuthSessionSyncStorageEvent(event)).toBe(true);
  });

  it('extracts signed-out state from auth sync storage event', () => {
    const event = new StorageEvent('storage', {
      key: AUTH_SESSION_SYNC_STORAGE_KEY,
      newValue: JSON.stringify({
        state: 'signed-out',
        at: 1_000,
        source: 'tab-a',
      }),
    });

    expect(getAuthSessionStateFromStorageEvent(event)).toBe('signed-out');
  });

  it('returns null for invalid auth sync storage event payload', () => {
    const event = new StorageEvent('storage', {
      key: AUTH_SESSION_SYNC_STORAGE_KEY,
      newValue: '{invalid-json',
    });

    expect(getAuthSessionStateFromStorageEvent(event)).toBeNull();
  });

  it('detects supabase auth storage keys', () => {
    expect(isSupabaseAuthStorageKey('sb-localhost-auth-token')).toBe(true);
    expect(isSupabaseAuthStorageKey('sb-test-something-auth-token')).toBe(true);
    expect(isSupabaseAuthStorageKey('motio_auth_session_sync')).toBe(false);
    expect(isSupabaseAuthStorageKey(null)).toBe(false);
  });
});
