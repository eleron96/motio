import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
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
  previewAccountDeletion: vi.fn(),
  requestAccountDeletion: vi.fn(),
  cancelAccountDeletion: vi.fn(),
  requestDataExport: vi.fn(),
  getDataExportStatus: vi.fn(),
  signOut: vi.fn(),
  state: {
    user: { id: 'user-1', email: 'me@example.com' } as { id: string; email: string } | null,
    profileDisplayName: 'Alice' as string | null,
    profilePurgeAfter: null as string | null,
    profileStatus: 'ACTIVE' as 'ACTIVE' | 'PENDING_DELETION' | 'PURGED',
    locale: 'en' as 'en' | 'ru',
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const storeState = {
      user: mocks.state.user,
      profileDisplayName: mocks.state.profileDisplayName,
      profilePurgeAfter: mocks.state.profilePurgeAfter,
      profileStatus: mocks.state.profileStatus,
      previewAccountDeletion: mocks.previewAccountDeletion,
      requestAccountDeletion: mocks.requestAccountDeletion,
      cancelAccountDeletion: mocks.cancelAccountDeletion,
      requestDataExport: mocks.requestDataExport,
      getDataExportStatus: mocks.getDataExportStatus,
      signOut: mocks.signOut,
    };
    return typeof selector === 'function' ? selector(storeState) : storeState;
  },
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (selector?: (state: unknown) => unknown) => {
    const state = { locale: mocks.state.locale };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

import { DeleteAccountWizard } from '@/features/auth/components/DeleteAccountWizard';
import { AccountRestoreScreen } from '@/features/auth/components/AccountRestoreScreen';
import { DataExportButton } from '@/features/auth/components/DataExportButton';
import { PendingDeletionBanner } from '@/shared/components/PendingDeletionBanner';

const resetMocks = () => {
  mocks.previewAccountDeletion.mockReset();
  mocks.requestAccountDeletion.mockReset();
  mocks.cancelAccountDeletion.mockReset();
  mocks.requestDataExport.mockReset();
  mocks.getDataExportStatus.mockReset();
  mocks.signOut.mockReset();
  mocks.state.user = { id: 'user-1', email: 'me@example.com' };
  mocks.state.profileDisplayName = 'Alice';
  mocks.state.profilePurgeAfter = null;
  mocks.state.profileStatus = 'ACTIVE';
  mocks.state.locale = 'en';
  // Default: no export request yet.
  mocks.getDataExportStatus.mockResolvedValue({
    data: {
      hasRequest: false,
      id: null,
      status: 'none' as const,
      createdAt: null,
      readyAt: null,
      expiresAt: null,
      errorMessage: null,
      downloadUrl: null,
    },
  });
};

describe('DeleteAccountWizard', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('disables Continue until every workspace requiring action has a decision', async () => {
    mocks.previewAccountDeletion.mockResolvedValue({
      data: {
        workspacesRequiringAction: [
          {
            id: 'ws-1',
            name: 'Acme Workspace',
            candidates: [
              { user_id: 'heir-1', display_name: 'Bob', role: 'admin' as const },
              { user_id: 'heir-2', display_name: 'Carol', role: 'editor' as const },
            ],
          },
        ],
        workspacesAutoHandled: [],
        pendingInvitesCount: 0,
        purgeDelayDays: 30,
      },
    });

    render(<DeleteAccountWizard open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Acme Workspace')).toBeInTheDocument();
    });

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeDisabled();
  });

  it('shows the auto-handled workspaces list', async () => {
    mocks.previewAccountDeletion.mockResolvedValue({
      data: {
        workspacesRequiringAction: [],
        workspacesAutoHandled: [
          { id: 'ws-auto', name: 'Shared Space' },
        ],
        pendingInvitesCount: 0,
        purgeDelayDays: 30,
      },
    });

    render(<DeleteAccountWizard open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Shared Space')).toBeInTheDocument();
    });
    expect(
      screen.getByText('No workspaces need your attention — you can continue.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('enables the destroy button only when the phrase matches exactly', async () => {
    mocks.previewAccountDeletion.mockResolvedValue({
      data: {
        workspacesRequiringAction: [],
        workspacesAutoHandled: [],
        pendingInvitesCount: 0,
        purgeDelayDays: 30,
      },
    });
    mocks.requestAccountDeletion.mockResolvedValue({
      data: { purge_after: '2026-05-21T00:00:00Z' },
    });

    const user = userEvent.setup();
    render(<DeleteAccountWizard open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const confirmInput = await screen.findByLabelText('Type the phrase to confirm:');
    const deleteButton = screen.getByRole('button', { name: 'Delete account' });
    expect(deleteButton).toBeDisabled();

    await user.type(confirmInput, 'wrong phrase');
    expect(deleteButton).toBeDisabled();

    await user.clear(confirmInput);
    await user.type(
      confirmInput,
      'I understand that I am permanently deleting my account and losing access to all workspaces',
    );
    expect(deleteButton).toBeEnabled();

    await user.click(deleteButton);
    await waitFor(() => {
      expect(mocks.requestAccountDeletion).toHaveBeenCalledWith(
        [],
        'I understand that I am permanently deleting my account and losing access to all workspaces',
      );
    });
    await waitFor(() => {
      expect(
        screen.getByText(/Your account is now pending deletion/),
      ).toBeInTheDocument();
    });
  });

  it('exposes the display-name edit shortcut when callback provided', async () => {
    mocks.previewAccountDeletion.mockResolvedValue({
      data: {
        workspacesRequiringAction: [],
        workspacesAutoHandled: [],
        pendingInvitesCount: 0,
        purgeDelayDays: 30,
      },
    });
    const onEdit = vi.fn();
    const user = userEvent.setup();

    render(
      <DeleteAccountWizard open onOpenChange={() => {}} onEditDisplayName={onEdit} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const changeButton = await screen.findByRole('button', { name: 'Change name' });
    await user.click(changeButton);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('uses the Russian phrase when locale is ru', async () => {
    mocks.state.locale = 'ru';
    mocks.previewAccountDeletion.mockResolvedValue({
      data: {
        workspacesRequiringAction: [],
        workspacesAutoHandled: [],
        pendingInvitesCount: 0,
        purgeDelayDays: 30,
      },
    });

    const user = userEvent.setup();
    render(<DeleteAccountWizard open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Я понимаю, что удаляю свой аккаунт навсегда и теряю доступ ко всем рабочим пространствам',
        ),
      ).toBeInTheDocument();
    });
  });
});

describe('AccountRestoreScreen', () => {
  beforeEach(() => {
    resetMocks();
    mocks.state.profileStatus = 'PENDING_DELETION';
    mocks.state.profilePurgeAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  });

  it('renders the purge countdown and export button', async () => {
    render(<AccountRestoreScreen />);
    expect(screen.getByText('Your account is scheduled for deletion')).toBeInTheDocument();
    expect(screen.getByText(/It will be permanently purged/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export my data/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Restore my account' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('calls cancelAccountDeletion and navigates when Restore is clicked', async () => {
    mocks.cancelAccountDeletion.mockResolvedValue({});
    const originalLocation = window.location;
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignMock },
      writable: true,
    });

    const user = userEvent.setup();
    render(<AccountRestoreScreen />);
    await user.click(screen.getByRole('button', { name: 'Restore my account' }));

    await waitFor(() => {
      expect(mocks.cancelAccountDeletion).toHaveBeenCalledTimes(1);
    });
    expect(assignMock).toHaveBeenCalledWith('/app');

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
  });

  it('displays an error if cancel fails', async () => {
    mocks.cancelAccountDeletion.mockResolvedValue({ error: 'restore denied' });
    const user = userEvent.setup();
    render(<AccountRestoreScreen />);
    await user.click(screen.getByRole('button', { name: 'Restore my account' }));
    await waitFor(() => {
      expect(screen.getByText('restore denied')).toBeInTheDocument();
    });
  });
});

describe('DataExportButton', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('shows "Export my data" when no export exists, then triggers request', async () => {
    mocks.requestDataExport.mockResolvedValue({ data: { id: 'req-1' } });
    const user = userEvent.setup();
    render(<DataExportButton />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export my data/ })).toBeInTheDocument();
    });

    // After request succeeds, the button refreshes status — make the next poll return "pending".
    mocks.getDataExportStatus.mockResolvedValueOnce({
      data: {
        hasRequest: true,
        id: 'req-1',
        status: 'pending',
        createdAt: new Date().toISOString(),
        readyAt: null,
        expiresAt: null,
        errorMessage: null,
        downloadUrl: null,
      },
    });

    await user.click(screen.getByRole('button', { name: /Export my data/ }));
    await waitFor(() => {
      expect(mocks.requestDataExport).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText(/Preparing your data/)).toBeInTheDocument();
    });
  });

  it('surfaces retry-after when rate limited', async () => {
    mocks.requestDataExport.mockResolvedValue({ error: 'data export rate limit', retryAfter: 120 });
    const user = userEvent.setup();
    render(<DataExportButton />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export my data/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Export my data/ }));
    await waitFor(() => {
      expect(screen.getByText(/You can request a new export in 2 minutes/)).toBeInTheDocument();
    });
  });

  it('shows a download link once status is ready', async () => {
    mocks.getDataExportStatus.mockReset();
    mocks.getDataExportStatus.mockResolvedValue({
      data: {
        hasRequest: true,
        id: 'req-1',
        status: 'ready',
        createdAt: '2026-04-21T00:00:00Z',
        readyAt: '2026-04-21T00:01:00Z',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        errorMessage: null,
        downloadUrl: 'https://example.com/export.zip',
      },
    });
    render(<DataExportButton />);
    const link = await screen.findByRole('link', { name: /Download export/ });
    expect(link).toHaveAttribute('href', 'https://example.com/export.zip');
  });

  it('shows expiration notice when an export is past its expiry', async () => {
    mocks.getDataExportStatus.mockReset();
    mocks.getDataExportStatus.mockResolvedValue({
      data: {
        hasRequest: true,
        id: 'req-1',
        status: 'expired',
        createdAt: '2026-04-01T00:00:00Z',
        readyAt: '2026-04-01T00:01:00Z',
        expiresAt: '2026-04-10T00:00:00Z',
        errorMessage: null,
        downloadUrl: null,
      },
    });
    render(<DataExportButton />);
    await waitFor(() => {
      expect(
        screen.getByText(/The previous export file has expired/),
      ).toBeInTheDocument();
    });
  });

  it('reports failure message when export failed', async () => {
    mocks.getDataExportStatus.mockReset();
    mocks.getDataExportStatus.mockResolvedValue({
      data: {
        hasRequest: true,
        id: 'req-1',
        status: 'failed',
        createdAt: '2026-04-21T00:00:00Z',
        readyAt: null,
        expiresAt: null,
        errorMessage: 'storage quota exceeded',
        downloadUrl: null,
      },
    });
    render(<DataExportButton />);
    await waitFor(() => {
      expect(screen.getByText(/storage quota exceeded/)).toBeInTheDocument();
    });
  });
});

describe('PendingDeletionBanner', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('renders nothing when the user is ACTIVE', () => {
    mocks.state.profileStatus = 'ACTIVE';
    const { container } = render(<PendingDeletionBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a restore link when the user is PENDING_DELETION', () => {
    mocks.state.profileStatus = 'PENDING_DELETION';
    mocks.state.profilePurgeAfter = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    render(<PendingDeletionBanner />);
    expect(screen.getByText(/Account deletion scheduled/)).toBeInTheDocument();
  });
});
