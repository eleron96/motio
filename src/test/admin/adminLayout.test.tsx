import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { authState, adminState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'u1', email: 'owner@example.com' } as { id: string; email: string } | null,
    isSuperAdmin: true,
    signOut: vi.fn(),
  },
  adminState: {
    adminUsers: [
      { id: 'a', email: 'a@example.com', displayName: null, workspaces: [], workspaceCount: 0, ownedWorkspaceCount: 0, managedWorkspaceCount: 0, storageUsedBytes: 1024, storageObjectsCount: 1, createdAt: '2026-01-01', lastSignInAt: null },
      { id: 'b', email: 'b@example.com', displayName: null, workspaces: [], workspaceCount: 0, ownedWorkspaceCount: 0, managedWorkspaceCount: 0, storageUsedBytes: 2048, storageObjectsCount: 2, createdAt: '2026-01-02', lastSignInAt: null },
    ],
    adminUsersLoading: false,
    fetchAdminUsers: vi.fn(),
    adminWorkspaces: [{ id: 'w1' }],
    adminWorkspacesLoading: false,
    fetchAdminWorkspaces: vi.fn(),
    backups: [
      { name: 'daily-1.dump', type: 'daily', size: 10, createdAt: '2026-07-01T10:00:00Z' },
      { name: 'manual-2.dump', type: 'manual', size: 10, createdAt: '2026-07-15T10:00:00Z' },
    ],
    backupsLoading: false,
    fetchBackups: vi.fn(),
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (s: typeof authState) => unknown) =>
    (typeof selector === 'function' ? selector(authState) : authState),
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

vi.mock('@/shared/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/shared/lib/seo/usePageSeo', () => ({ usePageSeo: vi.fn() }));

// The overview renders the messaging summary, which asks the admin function for
// the announcement history on mount. Unmocked, that is a real request racing the
// end of the test — it answered after teardown and failed the whole run.
vi.mock('@/infrastructure/auth/functionsGateway', () => ({
  invokeAdminFunction: vi.fn(async () => ({ data: { announcements: [] }, error: '' })),
}));

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), ''),
}));

import AdminLayout from '@/features/admin/components/AdminLayout';
import AdminOverviewPage from '@/features/admin/pages/AdminOverviewPage';

const renderAdmin = (path = '/app/admin') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="/app/admin" element={<AdminOverviewPage />} />
        <Route path="/app/admin/users" element={<div>users page body</div>} />
      </Route>
    </Routes>
  </MemoryRouter>,
);

describe('AdminLayout', () => {
  beforeEach(() => {
    authState.isSuperAdmin = true;
  });

  it('denies access to non super admins', () => {
    authState.isSuperAdmin = false;
    renderAdmin();

    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });

  it('renders section navigation and the overview metrics', async () => {
    renderAdmin();

    for (const label of ['Overview', 'Users', 'Workspaces', 'Easter eggs', 'Backups']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }

    // Metrics come straight from the mocked store: 2 backups total and the
    // latest one is the July 15 manual dump. Awaited, so the announcement
    // history the summary asks for settles inside the test rather than after it.
    expect(await screen.findByText('Backups stored')).toBeInTheDocument();
    expect(screen.getByText('manual-2.dump')).toBeInTheDocument();
  });

  it('renders the nested section page under its route', () => {
    renderAdmin('/app/admin/users');

    expect(screen.getByText('users page body')).toBeInTheDocument();
  });
});
