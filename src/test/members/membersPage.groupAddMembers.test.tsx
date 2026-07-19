import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MembersPage from '@/features/members/pages/MembersPage';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/lib/seo/usePageSeo', () => ({
  usePageSeo: vi.fn(),
}));

vi.mock('@/features/workspace/components/WorkspacePageHeader', () => ({
  WorkspacePageHeader: ({ primaryAction }: { primaryAction?: React.ReactNode }) => (
    <div>
      <div>Workspace header</div>
      {primaryAction}
    </div>
  ),
}));

vi.mock('@/features/members/components/MembersSidebar', () => ({
  MembersSidebar: () => <div>Members sidebar</div>,
}));

vi.mock('@/features/members/components/MemberTasksPanel', () => ({
  MemberTasksPanel: () => <div>Member tasks panel</div>,
}));

vi.mock('@/features/members/components/MembersDialogs', () => ({
  MembersDialogs: () => null,
}));

vi.mock('@/features/workspace/components/WorkspaceMembersPanel', () => ({
  WorkspaceMembersPanel: () => <div>Workspace members panel</div>,
}));

vi.mock('@/infrastructure/members/memberTasksRepository', () => ({
  fetchAssigneeTasks: vi.fn(async () => ({ tasks: [], totalCount: 0 })),
}));

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    assignees: [
      { id: 'a1', userId: 'u1', name: 'Anna Active', isActive: true },
      { id: 'a2', userId: 'u2', name: 'Boris Disabled', isActive: false },
      { id: 'a3', userId: 'u3', name: 'Nina Existing', isActive: true },
    ],
    memberGroupAssignments: [],
    projects: [],
    statuses: [],
    taskTypes: [],
    tags: [],
    taskCommentCounts: {},
    loadWorkspaceData: vi.fn(),
    refreshTaskCommentCounts: vi.fn(async () => undefined),
    fetchAssigneeTaskCounts: vi.fn(async () => ({ counts: {}, date: '2026-03-23' })),
    fetchMemberGroups: vi.fn(async () => ({ groups: [{ id: 'g1', name: 'Backend' }] })),
    fetchGroupMembers: vi.fn(async () => ({
      members: [
        {
          userId: 'u3',
          role: 'viewer',
          email: 'nina@example.com',
          displayName: 'Nina Existing',
        },
      ],
    })),
    createMemberGroup: vi.fn(async () => ({ error: undefined })),
    updateMemberGroup: vi.fn(async () => ({ error: undefined })),
    deleteMemberGroup: vi.fn(async () => ({ error: undefined })),
    deleteTasks: vi.fn(async () => ({ error: undefined })),
    setHighlightedTaskTarget: vi.fn(),
    setSelectedTaskId: vi.fn(),
    setGroupMode: vi.fn(),
    setViewMode: vi.fn(),
    setCurrentDate: vi.fn(),
    requestScrollToDate: vi.fn(),
    clearFilters: vi.fn(),
  },
  authState: {
    user: { id: 'u-admin' },
    members: [
      {
        userId: 'u1',
        role: 'editor',
        email: 'anna@example.com',
        displayName: 'Anna Workspace',
        groupId: null,
        avatarUrl: null,
      },
      {
        userId: 'u2',
        role: 'viewer',
        email: 'boris@example.com',
        displayName: 'Boris Workspace',
        groupId: null,
        avatarUrl: null,
      },
      {
        userId: 'u3',
        role: 'viewer',
        email: 'nina@example.com',
        displayName: 'Nina Workspace',
        groupId: 'g1',
        avatarUrl: null,
      },
    ],
    currentWorkspaceId: 'workspace-1',
    currentWorkspaceRole: 'admin',
    isSuperAdmin: false,
    workspaces: [],
    workspacesLoaded: true,
    updateMemberGroup: vi.fn(async () => ({ error: undefined })),
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: typeof plannerState) => unknown) => selector(plannerState),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

const renderPage = () => render(
  <MemoryRouter>
    <MembersPage />
  </MemoryRouter>,
);

describe('MembersPage group add-member popover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('members-mode-workspace-1', 'groups');
  });

  it('hides disabled people by default and reveals them through the dedicated toggle', async () => {
    const user = userEvent.setup();

    renderPage();

    const addMemberButton = await screen.findByRole('button', { name: 'Add member' });
    await user.click(addMemberButton);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Anna Active')).toBeInTheDocument();
    expect(within(dialog).queryByText('Boris Disabled')).not.toBeInTheDocument();

    await user.type(within(dialog).getByPlaceholderText('Search members...'), 'boris');
    expect(within(dialog).getByText('No active members match the search.')).toBeInTheDocument();
    expect(within(dialog).getByText('Show disabled people to add them.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Show disabled people' }));

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByText('Boris Disabled')).toBeInTheDocument();
    });
    expect(within(screen.getByRole('dialog')).getByText('Disabled')).toBeInTheDocument();
  });

  it('shows a readable empty state when no members match the search', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add member' }));
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByPlaceholderText('Search members...'), 'olivia');

    expect(within(dialog).getByText('No members match the search.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Show disabled people to add them.')).not.toBeInTheDocument();
  });
});
