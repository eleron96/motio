import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

// Rendered on desktop only — its absence on a phone is part of what this
// checks, so it stays mocked rather than dropped.
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
    setHighlightedTaskTarget: vi.fn(),
    setGroupMode: vi.fn(),
    setViewMode: vi.fn(),
    setCurrentDate: vi.fn(),
    requestScrollToDate: vi.fn(),
    clearFilters: vi.fn(),
  },
  authState: {
    user: { id: 'u1' },
    members: [],
    currentWorkspaceId: 'w1',
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

const useIsMobileMock = vi.mocked(useIsMobile);

describe('MembersPage mobile layout', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('browses people on a full screen instead of the desktop sidebar', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Member tasks panel')).toBeInTheDocument();
    expect(screen.getByText('Select a person')).toBeInTheDocument();
    // The desktop sidebar has no place on a phone.
    expect(screen.queryByText('Members sidebar')).not.toBeInTheDocument();

    // Two controls are labelled "People": the section pill (inside the subnav)
    // and the trigger that opens the browse screen. Target the latter.
    const subnav = screen.getByRole('navigation', { name: 'People sections' });
    const browseButton = screen
      .getAllByRole('button', { name: 'People' })
      .find((button) => !subnav.contains(button));
    expect(browseButton).toBeDefined();
    await user.click(browseButton as HTMLElement);

    const screenDialog = await screen.findByRole('dialog');
    expect(within(screenDialog).getByPlaceholderText('Search people...')).toBeInTheDocument();
    expect(within(screenDialog).getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('keeps the sections swipeable', () => {
    useIsMobileMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>,
    );

    // Both sections are mounted in the deck, so a swipe has somewhere to go.
    const deck = screen.getByTestId('mobile-swipe-deck');
    expect(deck).toBeInTheDocument();
    expect(within(deck).getByText('Member tasks panel')).toBeInTheDocument();
  });
});
