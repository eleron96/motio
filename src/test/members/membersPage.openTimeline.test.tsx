import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MembersPage from '@/features/members/pages/MembersPage';
import { fetchAssigneeTasks } from '@/infrastructure/members/memberTasksRepository';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/lib/seo/usePageSeo', () => ({
  usePageSeo: vi.fn(),
}));

vi.mock('@/features/workspace/components/WorkspacePageHeader', () => ({
  WorkspacePageHeader: () => <div>Workspace header</div>,
}));

vi.mock('@/features/workspace/components/WorkspaceMembersPanel', () => ({
  WorkspaceMembersPanel: () => <div>Workspace members panel</div>,
}));

vi.mock('@/features/members/components/MembersSidebar', () => ({
  MembersSidebar: () => <div>Members sidebar</div>,
}));

vi.mock('@/features/members/components/MemberTasksPanel', () => ({
  MemberTasksPanel: ({
    selectedAssignee,
    displayTaskRows,
    onSelectTask,
  }: {
    selectedAssignee: { id: string } | null;
    displayTaskRows: Array<{ task: { id: string } }>;
    onSelectTask: (taskId: string) => void;
  }) => (
    <div>
      <div>{selectedAssignee ? 'Assignee selected' : 'No assignee selected'}</div>
      {displayTaskRows.length > 0 && (
        <button type="button" onClick={() => onSelectTask(displayTaskRows[0].task.id)}>
          Open task details
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/features/members/components/MembersDialogs', () => ({
  MembersDialogs: ({
    selectedTaskId,
    handleOpenTaskInTimeline,
  }: {
    selectedTaskId: string | null;
    handleOpenTaskInTimeline: () => void;
  }) => (
    <div>
      {selectedTaskId && (
        <button type="button" onClick={handleOpenTaskInTimeline}>
          Go to task
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/infrastructure/members/memberTasksRepository', () => ({
  fetchAssigneeTasks: vi.fn(),
}));

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    assignees: [
      { id: 'assignee-1', userId: 'user-1', name: 'Alice Baker', isActive: true },
    ],
    memberGroupAssignments: [],
    projects: [],
    statuses: [],
    taskTypes: [],
    tags: [],
    taskCommentCounts: {},
    loadWorkspaceData: vi.fn(),
    refreshTaskCommentCounts: vi.fn(async () => undefined),
    fetchAssigneeTaskCounts: vi.fn(async () => ({ counts: { 'assignee-1': 1 }, date: '2026-03-17' })),
    fetchMemberGroups: vi.fn(async () => ({ groups: [] })),
    fetchGroupMembers: vi.fn(async () => ({ members: [] })),
    createMemberGroup: vi.fn(async () => ({ error: undefined })),
    updateMemberGroup: vi.fn(async () => ({ error: undefined })),
    deleteMemberGroup: vi.fn(async () => ({ error: undefined })),
    deleteTasks: vi.fn(async () => ({ error: undefined })),
    setHighlightedTaskId: vi.fn(),
    setHighlightedTaskTarget: vi.fn(),
    setSelectedTaskId: vi.fn(),
    setGroupMode: vi.fn(),
    setViewMode: vi.fn(),
    setCurrentDate: vi.fn(),
    requestScrollToDate: vi.fn(),
    clearFilters: vi.fn(),
  },
  authState: {
    user: { id: 'user-1' },
    members: [
      {
        userId: 'user-1',
        role: 'admin',
        email: 'alice@example.com',
        displayName: 'Alice Baker',
      },
    ],
    currentWorkspaceId: 'workspace-1',
    currentWorkspaceRole: 'admin',
    isSuperAdmin: false,
    workspaces: [],
    workspacesLoaded: true,
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: typeof plannerState) => unknown) => selector(plannerState),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

describe('MembersPage open task in timeline', () => {
  const fetchAssigneeTasksMock = vi.mocked(fetchAssigneeTasks);

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('planner-filters-user-1', JSON.stringify({ projectIds: ['project-1'] }));
    fetchAssigneeTasksMock.mockResolvedValue({
      tasks: [
        {
          id: 'task-1',
          title: 'Launch checklist',
          description: '',
          assigneeIds: ['assignee-1'],
          statusId: 'status-1',
          typeId: 'type-1',
          tagIds: [],
          startDate: '2026-03-20',
          endDate: '2026-03-20',
          priority: null,
          repeatId: null,
          projectId: null,
        } as never,
      ],
      totalCount: 1,
    });
  });

  it('clears planner selection before navigating to the highlighted timeline task', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );

    await screen.findByRole('button', { name: 'Open task details' });
    await user.click(screen.getByRole('button', { name: 'Open task details' }));
    await user.click(await screen.findByRole('button', { name: 'Go to task' }));

    await waitFor(() => {
      expect(plannerState.setSelectedTaskId).toHaveBeenCalledWith(null);
      expect(plannerState.setHighlightedTaskTarget).toHaveBeenCalledWith('task-1', 'assignee-1');
      expect(plannerState.setGroupMode).toHaveBeenCalledWith('assignee');
      expect(plannerState.setViewMode).toHaveBeenCalledWith('day');
      expect(plannerState.setCurrentDate).toHaveBeenCalledWith('2026-03-20');
      expect(plannerState.requestScrollToDate).toHaveBeenCalledWith('2026-03-20');
      expect(plannerState.clearFilters).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/app');
    });

    expect(window.localStorage.getItem('planner-filters-user-1')).toBeNull();
  });
});
