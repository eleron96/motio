import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ProjectsPage from '@/features/projects/pages/ProjectsPage';
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

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: vi.fn(() => 'en'),
}));

vi.mock('@/shared/lib/dateFnsLocale', () => ({
  resolveDateFnsLocale: vi.fn(() => undefined),
}));

vi.mock('@/features/workspace/components/WorkspacePageHeader', () => ({
  WorkspacePageHeader: ({ primaryAction }: { primaryAction?: React.ReactNode }) => (
    <div>
      <div>Workspace header</div>
      {primaryAction}
    </div>
  ),
}));

vi.mock('@/features/projects/components/ProjectsSidebar', () => ({
  ProjectsSidebar: () => <div>Projects sidebar</div>,
}));

vi.mock('@/features/projects/components/ProjectsMainPanel', () => ({
  ProjectsMainPanel: () => <div>Projects main panel</div>,
}));

vi.mock('@/features/projects/components/ProjectsDialogs', () => ({
  ProjectsDialogs: () => null,
}));

vi.mock('@/features/projects/hooks/useProjectsPageEffects', () => ({
  useProjectsPageEffects: vi.fn(),
}));

vi.mock('@/features/projects/hooks/useProjectTasksQuery', () => ({
  useProjectTasksQuery: () => ({
    projectTasks: [],
    totalCount: 0,
    availableAssigneeIds: [],
    tasksLoading: false,
    tasksError: '',
    refetchTasks: vi.fn(),
  }),
}));

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    projects: [
      { id: 'p1', name: 'Website redesign', code: 'WEB', color: '#3b82f6', archived: false, customerId: null },
    ],
    milestones: [],
    trackedProjectIds: [],
    customers: [],
    customerContacts: [],
    memberGroups: [],
    projectMembers: [],
    projectActivity: [],
    statuses: [],
    assignees: [],
    taskTypes: [],
    tags: [],
    loadWorkspaceData: vi.fn(),
    addProject: vi.fn(),
    addCustomer: vi.fn(),
    updateProject: vi.fn(),
    updateCustomer: vi.fn(),
    deleteCustomer: vi.fn(),
    addCustomerContact: vi.fn(),
    deleteCustomerContact: vi.fn(),
    addProjectMember: vi.fn(),
    deleteProjectMember: vi.fn(),
    addProjectActivity: vi.fn(),
    updateProjectActivity: vi.fn(),
    deleteProjectActivity: vi.fn(),
    updateAssignee: vi.fn(),
    deleteProject: vi.fn(),
    deleteMilestone: vi.fn(),
    toggleTrackedProject: vi.fn(),
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

describe('ProjectsPage mobile layout', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('puts the project list in the deck and walks into a project', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    // Level one is the list itself, not a button that opens a drawer.
    const deck = screen.getByTestId('mobile-swipe-deck');
    expect(within(deck).getByPlaceholderText('Search projects...')).toBeInTheDocument();
    expect(screen.queryByText('Projects sidebar')).not.toBeInTheDocument();

    await user.click(within(deck).getByText('[WEB] Website redesign'));

    // Level two: the project's own screen, with a way back.
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByText('Projects main panel')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('swipes through all four sections', () => {
    useIsMobileMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    const strip = screen.getByRole('navigation', { name: 'Project sections' });
    ['Projects', 'Milestones', 'Customers', 'Contacts'].forEach((label) => {
      expect(within(strip).getByRole('button', { name: label })).toBeInTheDocument();
    });

    // Every section is mounted in the deck, so a swipe has somewhere to go.
    const deck = screen.getByTestId('mobile-swipe-deck');
    expect(within(deck).getByPlaceholderText('Search projects...')).toBeInTheDocument();
    expect(within(deck).getByPlaceholderText('Search milestones...')).toBeInTheDocument();
    expect(within(deck).getByPlaceholderText('Search customers...')).toBeInTheDocument();
  });

  it('opens the project filters as a screen', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Filters/ }));

    const filters = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(filters).getByText('Customers')).toBeInTheDocument();
    expect(within(filters).getByRole('switch', { name: 'Show archived' })).toBeInTheDocument();
  });
});
