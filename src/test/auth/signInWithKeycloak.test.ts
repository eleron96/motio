import { beforeEach, describe, expect, it, vi } from 'vitest';

// Must be hoisted before any import that transitively pulls in authStore or supabaseClient.
vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: {
    getState: vi.fn().mockReturnValue({ locale: null }),
  },
}));

import { supabase } from '@/shared/lib/supabaseClient';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useAuthStore } from '@/features/auth/store/authStore';

const mockSignInWithOAuth = supabase.auth.signInWithOAuth as ReturnType<typeof vi.fn>;
const mockGetState = useLocaleStore.getState as ReturnType<typeof vi.fn>;

describe('signInWithKeycloak', () => {
  beforeEach(() => {
    // Clear call history so each test inspects only its own calls via mock.calls[0].
    mockSignInWithOAuth.mockClear();
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
    mockGetState.mockReturnValue({ locale: null });
  });

  it('does not include prompt in queryParams when forceLogin is false', async () => {
    const { signInWithKeycloak } = useAuthStore.getState();
    await signInWithKeycloak('https://app/auth', { forceLogin: false });

    const call = mockSignInWithOAuth.mock.calls[0]?.[0];
    expect(call?.options?.queryParams).not.toHaveProperty('prompt');
  });

  it('does not include prompt in queryParams when options are omitted', async () => {
    const { signInWithKeycloak } = useAuthStore.getState();
    await signInWithKeycloak('https://app/auth');

    const call = mockSignInWithOAuth.mock.calls[0]?.[0];
    expect(call?.options?.queryParams).not.toHaveProperty('prompt');
  });

  it('adds prompt=login to queryParams when forceLogin is true', async () => {
    const { signInWithKeycloak } = useAuthStore.getState();
    await signInWithKeycloak('https://app/auth', { forceLogin: true });

    const call = mockSignInWithOAuth.mock.calls[0]?.[0];
    expect(call?.options?.queryParams?.prompt).toBe('login');
  });

  it('includes both ui_locales and prompt=login when forceLogin is true and locale is set', async () => {
    mockGetState.mockReturnValue({ locale: 'ru' });

    const { signInWithKeycloak } = useAuthStore.getState();
    await signInWithKeycloak('https://app/auth', { forceLogin: true });

    const call = mockSignInWithOAuth.mock.calls[0]?.[0];
    expect(call?.options?.queryParams?.prompt).toBe('login');
    expect(call?.options?.queryParams?.ui_locales).toBe('ru');
  });

  it('uses the provided redirectTo as the OAuth redirect destination', async () => {
    const { signInWithKeycloak } = useAuthStore.getState();
    await signInWithKeycloak('https://app/auth?redirect=%2Fapp', { forceLogin: false });

    const call = mockSignInWithOAuth.mock.calls[0]?.[0];
    expect(call?.options?.redirectTo).toBe('https://app/auth?redirect=%2Fapp');
  });

  it('returns error message when signInWithOAuth fails', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: { message: 'provider error' } });

    const { signInWithKeycloak } = useAuthStore.getState();
    const result = await signInWithKeycloak('https://app/auth');

    expect(result.error).toBe('provider error');
  });

  it('always uses keycloak as the provider', async () => {
    const { signInWithKeycloak } = useAuthStore.getState();
    await signInWithKeycloak();

    const call = mockSignInWithOAuth.mock.calls[0]?.[0];
    expect(call?.provider).toBe('keycloak');
  });
});
