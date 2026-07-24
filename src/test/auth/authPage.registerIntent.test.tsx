import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { clearRecentSignOut } from '@/features/auth/lib/recentSignOut';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSignInWithKeycloak = vi.fn().mockResolvedValue({});
const mockSetSignOutRedirectInProgress = vi.fn();

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (s: unknown) => unknown) => {
    const state = {
      user: null,
      loading: false,
      signInWithKeycloak: mockSignInWithKeycloak,
      signOutRedirectInProgress: false,
      setSignOutRedirectInProgress: mockSetSignOutRedirectInProgress,
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (selector?: (s: unknown) => unknown) => {
    const state = { locale: 'en', setLocale: vi.fn() };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/shared/lib/seo/usePageSeo', () => ({ usePageSeo: vi.fn() }));

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), ''),
}));

// ── Helper ─────────────────────────────────────────────────────────────────

const renderAuthPage = async (search = '') => {
  const { default: AuthPage } = await import('@/features/auth/pages/AuthPage');
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/auth', search }]}>
      <AuthPage />
    </MemoryRouter>,
  );
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AuthPage: ?intent=register opens the Keycloak registration form', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearRecentSignOut();
    mockSignInWithKeycloak.mockClear();
    vi.resetModules();
  });

  it('passes register=true in the auto-flow when intent=register is present', async () => {
    await renderAuthPage('?intent=register');

    await waitFor(() => {
      expect(mockSignInWithKeycloak).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ register: true }),
      );
    });
  });

  it('passes register=false in the auto-flow without the intent param', async () => {
    await renderAuthPage();

    await waitFor(() => {
      expect(mockSignInWithKeycloak).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ register: false }),
      );
    });
  });

  it('passes register=true on manual button click when intent=register', async () => {
    // silent=1 suppresses the auto-flow so only the manual button fires it.
    await renderAuthPage('?silent=1&intent=register');

    const button = await screen.findByRole('button', { name: /keycloak/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSignInWithKeycloak).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ register: true }),
      );
    });
  });

  it('shows the create-account title when intent=register', async () => {
    await renderAuthPage('?silent=1&intent=register');

    expect(await screen.findByText('Create your account')).toBeInTheDocument();
    expect(screen.queryByText('Sign in required')).not.toBeInTheDocument();
  });
});
