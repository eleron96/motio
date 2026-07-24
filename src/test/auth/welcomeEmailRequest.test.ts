import { beforeEach, describe, expect, it, vi } from 'vitest';

// Must be hoisted before any import that transitively pulls in authStore or supabaseClient.
const { profileSingle, profileUpdateEq, functionsInvoke, getPendingLocaleMock, callOrder } = vi.hoisted(() => {
  const callOrder: string[] = [];
  return {
    callOrder,
    profileSingle: vi.fn(),
    profileUpdateEq: vi.fn(async () => {
      callOrder.push('locale-update');
      return { error: null };
    }),
    functionsInvoke: vi.fn(async () => {
      callOrder.push('welcome-invoke');
      return { data: { sent: true }, error: null };
    }),
    getPendingLocaleMock: vi.fn<() => string | null>(() => null),
  };
});

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: profileSingle,
        })),
      })),
      update: vi.fn(() => ({
        eq: profileUpdateEq,
      })),
    })),
    functions: {
      invoke: functionsInvoke,
    },
  },
}));

vi.mock('@/features/auth/lib/pendingLocale', () => ({
  getPendingLocale: getPendingLocaleMock,
  clearPendingLocale: vi.fn(),
  setPendingLocale: vi.fn(),
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: {
    getState: vi.fn().mockReturnValue({
      locale: null,
      setLocale: vi.fn(),
      setLocaleFromProfile: vi.fn(),
    }),
  },
}));

vi.mock('@/shared/store/accentColorStore', () => ({
  useAccentColorStore: {
    getState: vi.fn().mockReturnValue({ setAccentFromProfile: vi.fn() }),
  },
}));

const baseProfile = {
  display_name: 'Alice',
  locale: 'en',
  avatar_url: null,
  status: 'ACTIVE',
  purge_after: null,
  preferences: {},
};

// The module-level "already requested" latch lives in authStore, so each test
// re-imports a fresh module instance via resetModules.
const fetchProfileAs = async (welcomeEmailSentAt: unknown) => {
  profileSingle.mockResolvedValue({
    data: { ...baseProfile, welcome_email_sent_at: welcomeEmailSentAt },
    error: null,
  });
  const { useAuthStore } = await import('@/features/auth/store/authStore');
  useAuthStore.setState({ user: { id: 'u1' } as never });
  await useAuthStore.getState().fetchProfile();
  return useAuthStore;
};

describe('welcome email request on first sign-in', () => {
  beforeEach(() => {
    vi.resetModules();
    functionsInvoke.mockClear();
    profileUpdateEq.mockClear();
    getPendingLocaleMock.mockReturnValue(null);
    callOrder.length = 0;
  });

  it('does not request when the field is missing (demo stub returns undefined)', async () => {
    await fetchProfileAs(undefined);
    expect(functionsInvoke).not.toHaveBeenCalled();
  });

  it('does not request when the greeting was already sent', async () => {
    await fetchProfileAs('2026-07-01T00:00:00Z');
    expect(functionsInvoke).not.toHaveBeenCalled();
  });

  it('requests the welcome email exactly once when the field is null', async () => {
    const useAuthStore = await fetchProfileAs(null);
    expect(functionsInvoke).toHaveBeenCalledTimes(1);
    expect(functionsInvoke).toHaveBeenCalledWith('mailer', { body: { action: 'welcome' } });

    // Second fetchProfile in the same tab must not re-request.
    await useAuthStore.getState().fetchProfile();
    expect(functionsInvoke).toHaveBeenCalledTimes(1);
  });

  it('persists the pre-sign-in locale before requesting the welcome email', async () => {
    getPendingLocaleMock.mockReturnValue('ru');
    await fetchProfileAs(null);

    expect(callOrder).toEqual(['locale-update', 'welcome-invoke']);
  });
});
