import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MembersPage from '@/features/members/pages/MembersPage';
import { useIsMobile } from '@/shared/hooks/use-mobile';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
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
    assignees: [],
    memberGroupAssignments: [],
    projects: [],
    statuses: [],
    taskTypes: [],
    tags: [],
    loadWorkspaceData: vi.fn(),
    fetchAssigneeTaskCounts: vi.fn(async () => ({ counts: {}, date: '2026-03-07' })),
    fetchMemberGroups: vi.fn(async () => ({ groups: [] })),
    fetchGroupMembers: vi.fn(async () => ({ members: [] })),
    createMemberGroup: vi.fn(async () => ({ error: undefined })),
    updateMemberGroup: vi.fn(async () => ({ error: undefined })),
    deleteMemberGroup: vi.fn(async () => ({ error: undefined })),
    deleteTasks: vi.fn(async () => ({ error: undefined })),
    setHighlightedTaskId: vi.fn(),
    setViewMode: vi.fn(),
    setCurrentDate: vi.fn(),
    requestScrollToDate: vi.fn(),
    clearFilters: vi.fn(),
  },
  authState: {
    user: { id: 'u1' },
    currentWorkspaceId: 'w1',
    currentWorkspaceRole: 'admin',
    isSuperAdmin: false,
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: typeof plannerState) => unknown) => selector(plannerState),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

describe('MembersPage mobile layout', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('uses a sheet-based selector on mobile', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Member tasks panel')).toBeInTheDocument();
    expect(screen.getByText('Select a member')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tasks' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Members sidebar')).toBeInTheDocument();
  });
});
