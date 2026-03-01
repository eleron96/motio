import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { AUTH_SESSION_SYNC_STORAGE_KEY } from '@/features/auth/lib/authSessionSync';

const supabaseMocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));

const authStoreMocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  setLoading: vi.fn(),
  resolveSuperAdmin: vi.fn(),
  fetchWorkspaces: vi.fn(),
  fetchProfile: vi.fn(),
}));

const plannerStoreMocks = vi.hoisted(() => ({
  reset: vi.fn(),
}));

const recentSignOutMocks = vi.hoisted(() => ({
  markRecentSignOut: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: supabaseMocks.onAuthStateChange,
      getSession: supabaseMocks.getSession,
      signOut: supabaseMocks.signOut,
    },
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    setSession: authStoreMocks.setSession,
    setLoading: authStoreMocks.setLoading,
    resolveSuperAdmin: authStoreMocks.resolveSuperAdmin,
    fetchWorkspaces: authStoreMocks.fetchWorkspaces,
    fetchProfile: authStoreMocks.fetchProfile,
  }),
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: unknown) => unknown) => selector({
    reset: plannerStoreMocks.reset,
  }),
}));

vi.mock('@/features/auth/lib/recentSignOut', () => ({
  markRecentSignOut: recentSignOutMocks.markRecentSignOut,
}));

import { AuthProvider } from '@/features/auth/providers/AuthProvider';

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.getSession.mockResolvedValue({ data: { session: null } });
    supabaseMocks.signOut.mockResolvedValue({ error: null });
    authStoreMocks.resolveSuperAdmin.mockResolvedValue(false);
    supabaseMocks.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: supabaseMocks.unsubscribe,
        },
      },
    });
  });

  it('marks recent sign-out on cross-tab signed-out event', async () => {
    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(supabaseMocks.getSession).toHaveBeenCalled();
    });

    const event = new StorageEvent('storage', {
      key: AUTH_SESSION_SYNC_STORAGE_KEY,
      newValue: JSON.stringify({
        state: 'signed-out',
        at: Date.now(),
        source: 'remote-tab',
      }),
    });
    window.dispatchEvent(event);

    await waitFor(() => {
      expect(recentSignOutMocks.markRecentSignOut).toHaveBeenCalledTimes(1);
    });
    expect(supabaseMocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(authStoreMocks.setSession).toHaveBeenCalledWith(null);
  });
});
