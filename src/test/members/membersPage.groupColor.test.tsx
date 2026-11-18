import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MembersPage from '@/features/members/pages/MembersPage';
import { GROUP_PRESET_COLORS, toGroupMarkColor } from '@/shared/domain/groupColor';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

const { viewport } = vi.hoisted(() => ({ viewport: { mobile: false } }));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => viewport.mobile,
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

const SKY = '#6fbfe2';
const AMBER = '#deb373';

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    assignees: [{ id: 'a1', userId: 'u1', name: 'Anna Active', isActive: true }],
    memberGroupAssignments: [{ userId: 'u1', groupId: 'g1' }],
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
      groups: [
        { id: 'g1', name: 'Backend', color: '#6fbfe2' },
        // Never picked a colour.
        { id: 'g2', name: 'Frontend', color: null },
      ],
    })),
    fetchGroupMembers: vi.fn(async () => ({ members: [] })),
    createMemberGroup: vi.fn(async () => ({ error: undefined })),
    updateMemberGroup: vi.fn(async () => ({ error: undefined })),
    setMemberGroupColor: vi.fn(async () => ({ error: undefined })),
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
      { userId: 'u1', role: 'editor', email: 'anna@example.com', displayName: 'Anna', groupId: 'g1', avatarUrl: null },
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

describe('MembersPage group colour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewport.mobile = false;
    authState.currentWorkspaceRole = 'admin';
    window.localStorage.clear();
    window.localStorage.setItem('members-mode-workspace-1', 'groups');
  });

  it('marks every group in the list with its colour', async () => {
    renderPage();

    const backend = (await screen.findAllByText('Backend'))[0].closest('button');
    expect(backend?.querySelector('[data-color-dot]'))
      .toHaveStyle({ backgroundColor: toGroupMarkColor(SKY) });

    // "Frontend" never picked one and still gets a colour of its own.
    const frontend = screen.getByText('Frontend').closest('button');
    // …as far in hue from "Backend" as the palette allows.
    const automatic = toGroupMarkColor(GROUP_PRESET_COLORS[1]);
    expect(frontend?.querySelector('[data-color-dot]')).toHaveStyle({ backgroundColor: automatic });
  });

  it('lets an admin pick a colour from the open group\'s header', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Colour of Backend' }));
    const palette = await screen.findByRole('dialog');
    const swatches = within(palette).getAllByRole('button');
    // Twenty colours plus "Automatic colour" for a group that has its own.
    expect(swatches).toHaveLength(GROUP_PRESET_COLORS.length + 1);

    await user.click(swatches[GROUP_PRESET_COLORS.indexOf(AMBER)]);

    expect(plannerState.setMemberGroupColor).toHaveBeenCalledWith('workspace-1', 'g1', AMBER);
  });

  it('hands a group back to the automatic colour', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Colour of Backend' }));
    await user.click(await screen.findByRole('button', { name: 'Automatic colour' }));

    expect(plannerState.setMemberGroupColor).toHaveBeenCalledWith('workspace-1', 'g1', null);
  });

  it('offers no way back to automatic for a group that is already on it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Frontend'));
    await user.click(await screen.findByRole('button', { name: 'Colour of Frontend' }));

    const palette = await screen.findByRole('dialog');
    expect(within(palette).getAllByRole('button')).toHaveLength(GROUP_PRESET_COLORS.length);
    expect(within(palette).queryByRole('button', { name: 'Automatic colour' })).not.toBeInTheDocument();
  });

  it('shows everyone else the colour without the picker', async () => {
    authState.currentWorkspaceRole = 'editor';
    renderPage();

    expect((await screen.findAllByText('Backend')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Colour of Backend' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-color-dot]').length).toBeGreaterThan(0);
  });

  it('recolours a group on a phone from its menu, on a screen of its own', async () => {
    viewport.mobile = true;
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId('group-actions-g2'));
    await user.click(await screen.findByRole('menuitem', { name: 'Color' }));

    // A screen of swatches, not a popover.
    expect(await screen.findByRole('dialog', { name: 'Group colour' })).toBeInTheDocument();
    await user.click(screen.getByTestId(`group-color-${AMBER}`));

    expect(plannerState.setMemberGroupColor).toHaveBeenCalledWith('workspace-1', 'g2', AMBER);
  });
});
