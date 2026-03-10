import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { markRecentSignOut, clearRecentSignOut } from '@/features/auth/lib/recentSignOut';

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
  // Dynamic import ensures mocks are applied before the module executes and
  // consumeRecentSignOut() runs inside the useRef initializer on each fresh import.
  const { default: AuthPage } = await import('@/features/auth/pages/AuthPage');
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/auth', search }]}>
      <AuthPage />
    </MemoryRouter>,
  );
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AuthPage: forceLogin via forceLoginRef', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mockSignInWithKeycloak.mockClear();
    mockSetSignOutRedirectInProgress.mockClear();
    vi.resetModules();
  });

  it('passes forceLogin=true to signInWithKeycloak when recent sign-out marker exists (auto-flow)', async () => {
    markRecentSignOut();

    await renderAuthPage();

    await waitFor(() => {
      expect(mockSignInWithKeycloak).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ forceLogin: true }),
      );
    });
  });

  it('passes forceLogin=false when no recent sign-out marker exists (auto-flow)', async () => {
    clearRecentSignOut();

    await renderAuthPage();

    await waitFor(() => {
      expect(mockSignInWithKeycloak).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ forceLogin: false }),
      );
    });
  });

  it('passes forceLogin=true on manual button click when recent sign-out marker exists', async () => {
    markRecentSignOut();

    // silent=1 suppresses the auto-flow so only the manual button fires signInWithKeycloak.
    await renderAuthPage('?silent=1');

    const button = await screen.findByRole('button', { name: /keycloak/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSignInWithKeycloak).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ forceLogin: true }),
      );
    });
  });

  it('passes forceLogin=false on manual button click when no recent sign-out marker', async () => {
    clearRecentSignOut();

    await renderAuthPage('?silent=1');

    const button = await screen.findByRole('button', { name: /keycloak/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSignInWithKeycloak).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ forceLogin: false }),
      );
    });
  });

  it('consumes the marker so a second independent render uses forceLogin=false', async () => {
    markRecentSignOut();

    // First render — consumes the marker via useRef(consumeRecentSignOut()).
    await renderAuthPage('?silent=1');

    const button = await screen.findByRole('button', { name: /keycloak/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockSignInWithKeycloak).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ forceLogin: true }),
      );
    });

    // Reset module cache and mock call history for the second render.
    vi.resetModules();
    mockSignInWithKeycloak.mockClear();

    // Second render — marker already consumed, should be false.
    await renderAuthPage('?silent=1');

    const buttons = await screen.findAllByRole('button', { name: /keycloak/i });
    fireEvent.click(buttons[buttons.length - 1]!);

    await waitFor(() => {
      expect(mockSignInWithKeycloak).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ forceLogin: false }),
      );
    });
  });

  it('shows friendly message for stale oauth callback state without raw backend payload', async () => {
    await renderAuthPage('?error=oauth_callback_failed&error_code=bad_oauth_state');

    expect(await screen.findByText('Authentication error')).toBeInTheDocument();
    expect(screen.getByText('Your sign-in session expired. Please continue with Keycloak again.')).toBeInTheDocument();
    expect(mockSignInWithKeycloak).not.toHaveBeenCalled();
  });
});
