import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  WorkspacePageHeader: () => <div>Workspace header</div>,
}));

vi.mock('@/features/members/components/MemberTasksPanel', () => ({
  MemberTasksPanel: () => <div>Member tasks panel</div>,
}));

vi.mock('@/features/members/components/MembersDialogs', () => ({
  MembersDialogs: () => null,
}));

vi.mock('@/infrastructure/members/memberTasksRepository', () => ({
  fetchAssigneeTasks: vi.fn(async () => ({ tasks: [], totalCount: 0 })),
}));

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    assignees: [
      { id: 'a1', userId: 'u1', name: 'Anna Active', isActive: true },
      { id: 'a3', userId: 'u3', name: 'Nina Existing', isActive: true },
      // No account: there is nothing to hang a group on.
      { id: 'a4', userId: null, name: 'External Ed', isActive: true },
    ],
    memberGroupAssignments: [
      { userId: 'u1', groupId: null },
      { userId: 'u3', groupId: 'g1' },
    ],
    projects: [],
    statuses: [],
    taskTypes: [],
    tags: [],
    taskCommentCounts: {},
    loadWorkspaceData: vi.fn(),
    refreshTaskCommentCounts: vi.fn(async () => undefined),
    fetchTaskSubtasks: vi.fn(async () => ({ subtasks: [] })),
    fetchAssigneeTaskCounts: vi.fn(async () => ({ counts: {}, date: '2026-08-07' })),
    fetchMemberGroups: vi.fn(async () => ({
      groups: [{ id: 'g1', name: 'Backend' }, { id: 'g2', name: 'Frontend' }],
    })),
    fetchGroupMembers: vi.fn(async () => ({
      members: [
        { userId: 'u3', role: 'viewer', email: 'nina@example.com', displayName: 'Nina Existing' },
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
      { userId: 'u1', role: 'editor', email: 'anna@example.com', displayName: 'Anna', groupId: null, avatarUrl: null },
      { userId: 'u3', role: 'viewer', email: 'nina@example.com', displayName: 'Nina', groupId: 'g1', avatarUrl: null },
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

describe('MembersPage group assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('members-mode-workspace-1', 'tasks');
  });

  it('names the group each person is in', async () => {
    renderPage();

    expect(await screen.findByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('No group')).toBeInTheDocument();
  });

  it('assigns a group from the people list', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByTestId('assignee-actions-a1'));
    await user.click(await screen.findByRole('menuitem', { name: 'Assign a group' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Backend' }));

    expect(authState.updateMemberGroup).toHaveBeenCalledWith('u1', 'g1');
  });

  it('asks before taking someone out of their group', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByTestId('assignee-actions-a3'));
    await user.click(await screen.findByRole('menuitem', { name: 'Remove from group' }));

    // The confirmation is the gate: nothing is written until it is accepted.
    expect(authState.updateMemberGroup).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(authState.updateMemberGroup).toHaveBeenCalledWith('u3', null);
  });

  it('leaves people without an account out of it', async () => {
    renderPage();

    expect(await screen.findByText('External Ed')).toBeInTheDocument();
    expect(screen.queryByTestId('assignee-actions-a4')).not.toBeInTheDocument();
  });

  it('moves someone between groups from the group view', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('members-mode-workspace-1', 'groups');

    renderPage();

    await user.click(await screen.findByTestId('group-member-actions-u3'));
    await user.click(await screen.findByRole('menuitem', { name: 'Move to another group' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Frontend' }));

    expect(authState.updateMemberGroup).toHaveBeenCalledWith('u3', 'g2');
  });
});
