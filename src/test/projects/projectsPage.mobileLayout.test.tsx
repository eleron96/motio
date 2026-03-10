import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('@/features/projects/hooks/useProjectsViewPreferences', () => ({
  useProjectsViewPreferences: () => ({
    nameSort: 'asc',
    setNameSort: vi.fn(),
    groupByCustomer: false,
    setGroupByCustomer: vi.fn(),
    milestoneTab: 'active',
    setMilestoneTab: vi.fn(),
    milestoneGroupBy: 'month',
    setMilestoneGroupBy: vi.fn(),
  }),
}));

vi.mock('@/features/projects/hooks/useProjectsPageEffects', () => ({
  useProjectsPageEffects: vi.fn(),
}));

vi.mock('@/features/projects/hooks/useProjectTasksQuery', () => ({
  useProjectTasksQuery: () => ({
    projectTasks: [],
    tasksLoading: false,
    tasksError: '',
    refetchTasks: vi.fn(),
  }),
}));

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    projects: [],
    milestones: [],
    trackedProjectIds: [],
    customers: [],
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

  it('uses a sheet-based sidebar on mobile', async () => {
    useIsMobileMock.mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Projects main panel')).toBeInTheDocument();
    expect(screen.getByText('Select a project')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Projects' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Projects sidebar')).toBeInTheDocument();
  });
});
