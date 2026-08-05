import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof strings === 'string') return strings;
    return strings.reduce(
      (acc, str, index) => acc + str + (values[index] !== undefined ? String(values[index]) : ''),
      '',
    );
  },
}));

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  fetchProfileSettings: vi.fn(async () => ({
    data: { displayName: 'Alice', preferences: {}, marketingEmailsOptIn: false },
    error: undefined,
  })),
  updateProfilePreferences: vi.fn(async () => ({ error: undefined })),
  isMobile: true,
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => mocks.isMobile,
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      user: { id: 'user-1', email: 'alice@example.com' },
      updateDisplayName: vi.fn(async () => ({ error: undefined })),
      updateLocale: vi.fn(async () => ({ error: undefined })),
      updateAvatarUrl: vi.fn(),
      profileAvatarUrl: null,
      signOut: mocks.signOut,
      fetchProfileSettings: mocks.fetchProfileSettings,
      updateProfilePreferences: mocks.updateProfilePreferences,
      updateMarketingEmailsOptIn: vi.fn(async () => ({ error: undefined })),
      updatePushNotificationsOptIn: vi.fn(async () => ({ error: undefined })),
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (selector?: (state: unknown) => unknown) => {
    const state = { locale: 'en', setLocale: vi.fn() };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/shared/store/accentColorStore', () => ({
  useAccentColorStore: Object.assign(
    (selector?: (state: unknown) => unknown) => {
      const state = { setAccent: vi.fn() };
      return typeof selector === 'function' ? selector(state) : state;
    },
    { getState: () => ({ setAccent: vi.fn() }) },
  ),
}));

vi.mock('@/features/auth/hooks/useProfileSummary', () => ({
  useProfileSummary: () => ({ monthsInMotio: 3 }),
}));

vi.mock('@/features/auth/components/AvatarWithEditButton', () => ({
  AvatarWithEditButton: () => <div>avatar</div>,
}));

vi.mock('@/features/auth/components/ProfileSummary', () => ({
  ProfileSummary: () => <div>summary</div>,
}));

vi.mock('@/features/auth/components/DataExportButton', () => ({
  DataExportButton: () => <div>export</div>,
}));

vi.mock('@/features/auth/components/DeleteAccountWizard', () => ({
  DeleteAccountWizard: () => null,
}));

vi.mock('@/features/demo/hooks/useIsDemo', () => ({
  useIsDemo: () => false,
  isDemoRoute: () => false,
  useAppBasePath: () => '/app',
}));

vi.mock('@/shared/lib/push/pushClient', () => ({
  getNotificationPermission: () => 'default',
  hasActivePushSubscription: async () => false,
  isPushSupported: () => false,
  needsIosInstallForPush: () => false,
  subscribeToPush: async () => ({ ok: true }),
  unsubscribeFromPush: async () => {},
}));

import { AccountSettingsDialog } from '@/features/auth/components/AccountSettingsDialog';

const renderDialog = async () => {
  const onOpenChange = vi.fn();
  render(<AccountSettingsDialog open onOpenChange={onOpenChange} />);
  // The profile section loads asynchronously; wait for its content.
  await screen.findByRole('button', { name: /Sign out/ });
  return { onOpenChange };
};

describe('Account settings sign-out on mobile', () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
    mocks.isMobile = true;
  });

  it('is a pill, not a full-width bar', async () => {
    await renderDialog();

    const button = screen.getByRole('button', { name: /Sign out/ });
    expect(button.className).toContain('rounded-full');
    expect(button.className).not.toContain('w-full');
  });

  it('asks for confirmation before signing out', async () => {
    const user = userEvent.setup();
    await renderDialog();

    await user.click(screen.getByRole('button', { name: /Sign out/ }));

    const confirm = await screen.findByRole('alertdialog');
    expect(mocks.signOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(confirm).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Sign out/ }));
    const confirmAgain = await screen.findByRole('alertdialog');
    const confirmAction = within(confirmAgain).getByRole('button', { name: /Sign out/ });
    await user.click(confirmAction);

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it('signs out directly on desktop', async () => {
    mocks.isMobile = false;
    const user = userEvent.setup();
    await renderDialog();

    await user.click(screen.getByRole('button', { name: /Sign out/ }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
});
