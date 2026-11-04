import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signOut, forgetPersistedSession } = vi.hoisted(() => ({
  signOut: vi.fn(),
  forgetPersistedSession: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { auth: { signOut } },
  forgetPersistedSession,
}));

import { useAuthStore } from '@/features/auth/store/authStore';

describe('signOut when the auth server no longer knows the session', () => {
  beforeEach(() => {
    signOut.mockReset();
    forgetPersistedSession.mockReset();
    vi.stubGlobal('location', { ...window.location, replace: vi.fn() });
  });

  it('drops the stored session when both global and local sign-out fail', async () => {
    signOut.mockResolvedValue({ error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } });

    await useAuthStore.getState().signOut();

    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(forgetPersistedSession).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('leaves storage to supabase-js when sign-out works', async () => {
    signOut.mockResolvedValue({ error: null });

    await useAuthStore.getState().signOut();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(forgetPersistedSession).not.toHaveBeenCalled();
  });
});
