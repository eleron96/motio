import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const makeUsers = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
  email: `user${index + 1}@example.com`,
  displayName: `User ${index + 1}`,
  workspaces: [],
  workspaceCount: 0,
  ownedWorkspaceCount: 0,
  managedWorkspaceCount: 0,
  storageUsedBytes: 0,
  storageObjectsCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  lastSignInAt: null,
}));

const { adminState } = vi.hoisted(() => ({
  // Stable object: a fresh state per selector call would defeat useShallow.
  adminState: {
    adminUsers: [] as ReturnType<typeof makeUsers>,
    adminUsersLoading: false,
    adminUsersError: '',
    fetchAdminUsers: vi.fn(),
    adminForcePurgeAccount: vi.fn(),
  },
}));

vi.mock('@/features/admin/store/adminStore', () => ({
  useAdminStore: (selector?: (s: typeof adminState) => unknown) =>
    (typeof selector === 'function' ? selector(adminState) : adminState),
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (selector?: (s: { locale: string }) => unknown) => {
    const state = { locale: 'en' };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

import AdminUsersPage from '@/features/admin/pages/AdminUsersPage';

const emailCells = () => screen.getAllByText(/@example\.com$/);

describe('AdminUsersPage paging', () => {
  beforeEach(() => {
    window.localStorage.clear();
    adminState.adminUsers = makeUsers(72);
  });

  it('shows a page at a time instead of the whole list', () => {
    render(<AdminUsersPage />);

    expect(emailCells()).toHaveLength(50);
    expect(screen.getByText('1–50 of 72')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('turns the page', async () => {
    const user = userEvent.setup();
    render(<AdminUsersPage />);

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(emailCells()).toHaveLength(22);
    expect(screen.getByText('user51@example.com')).toBeInTheDocument();
    expect(screen.getByText('51–72 of 72')).toBeInTheDocument();
    // Nowhere left to go forward.
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('switches to ten rows at a time', async () => {
    const user = userEvent.setup();
    render(<AdminUsersPage />);

    await user.click(screen.getByRole('button', { name: '10' }));

    expect(emailCells()).toHaveLength(10);
    expect(screen.getByText('1 of 8')).toBeInTheDocument();
  });

  it('starts over on the first page when the search narrows the list', async () => {
    const user = userEvent.setup();
    render(<AdminUsersPage />);

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Search by email/), 'user1@');

    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    expect(emailCells()).toHaveLength(1);
  });
});
