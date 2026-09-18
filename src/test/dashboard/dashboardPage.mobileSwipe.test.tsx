import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '@/features/dashboard/pages/DashboardPage';
import { useIsMobile } from '@/shared/hooks/use-mobile';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
  Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

vi.mock('@/shared/lib/seo/usePageSeo', () => ({
  usePageSeo: vi.fn(),
}));

vi.mock('@/features/onboarding/hooks/useOnboardingTour', () => ({
  useOnboardingTour: vi.fn(),
}));

vi.mock('@/features/workspace/components/WorkspaceLayout', () => ({
  useWorkspaceHeader: vi.fn(),
}));

vi.mock('@/features/workspace/components/WorkspaceCommonDialogs', () => ({
  WorkspaceCommonDialogs: () => null,
}));

vi.mock('@/features/dashboard/components/WidgetEditorDialog', () => ({
  WidgetEditorDialog: () => null,
}));

// The two boards are what the page chooses between; their own behaviour is
// covered elsewhere, so here they only need to say which one came up.
vi.mock('@/features/dashboard/components/WorkloadHeatmapMobile', () => ({
  WorkloadHeatmapMobile: () => <div>Mobile heatmap</div>,
}));

vi.mock('@/features/dashboard/components/WorkloadHeatmapBoard', () => ({
  WorkloadHeatmapBoard: () => <div>Desktop heatmap</div>,
}));

vi.mock('@/shared/lib/featureFlags', () => ({
  isWorkloadHeatmapEnabled: () => true,
}));

const { authState, dashboardState } = vi.hoisted(() => ({
  authState: {
    currentWorkspaceId: 'ws-1',
    currentWorkspaceRole: 'admin',
    workspaces: [{ id: 'ws-1', name: 'WS', heatmapEnabled: true }],
    isSuperAdmin: false,
    workspacesLoaded: true,
  },
  dashboardState: {
    widgets: [],
    layouts: {},
    dashboards: [{ id: 'd1', name: 'Main' }],
    dashboardsWorkspaceId: 'ws-1',
    currentDashboardId: 'd1',
    statuses: [],
    projects: [],
    assignees: [],
    groups: [],
    assigneeGroupMap: {},
    milestones: [],
    loading: false,
    saving: false,
    dirty: false,
    error: null,
    statsByPeriod: {},
    loadDashboards: vi.fn(),
    setCurrentDashboardId: vi.fn(),
    loadDashboard: vi.fn(),
    saveDashboard: vi.fn(),
    createDashboard: vi.fn(),
    deleteDashboard: vi.fn(),
    renameDashboard: vi.fn(),
    resetDashboardState: vi.fn(),
    addWidget: vi.fn(),
    updateWidget: vi.fn(),
    removeWidget: vi.fn(),
    setLayouts: vi.fn(),
    loadFilterOptions: vi.fn(),
    loadMilestones: vi.fn(),
    loadStats: vi.fn(),
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => (
    typeof selector === 'function' ? selector(authState) : authState
  ),
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector?: (state: unknown) => unknown) => {
    const state = { loadWorkspaceData: vi.fn() };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/features/dashboard/store/dashboardStore', () => ({
  useDashboardStore: () => dashboardState,
  getClosestWidgetSize: vi.fn(),
}));

const DECK_WIDTH = 390;

const renderPage = () => render(
  <MemoryRouter>
    <DashboardPage />
  </MemoryRouter>,
);

const swipeLeft = (deck: HTMLElement) => {
  Object.defineProperty(deck, 'offsetWidth', { configurable: true, value: DECK_WIDTH });
  fireEvent.pointerDown(deck, { pointerId: 1, clientX: 300, clientY: 200 });
  fireEvent.pointerMove(deck, { pointerId: 1, clientX: 100, clientY: 200 });
  fireEvent.pointerUp(deck, { pointerId: 1, clientX: 100, clientY: 200 });
};

describe('DashboardPage on a phone', () => {
  beforeEach(() => {
    window.localStorage.clear();
    authState.workspaces = [{ id: 'ws-1', name: 'WS', heatmapEnabled: true }];
  });

  it('swipes from the dashboards over to the heatmap', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    renderPage();

    const deck = screen.getByTestId('mobile-swipe-deck');
    // The heatmap page is empty until it is first opened: nothing to fetch for
    // someone who never swipes over.
    expect(screen.queryByText('Mobile heatmap')).not.toBeInTheDocument();

    swipeLeft(deck);

    expect(await screen.findByText('Mobile heatmap')).toBeInTheDocument();
    expect(window.localStorage.getItem('dashboard-view-ws-1')).toBe('heatmap');
  });

  it('keeps the heatmap mounted after swiping back to the dashboards', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Heatmap' }));
    expect(await screen.findByText('Mobile heatmap')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dashboards' }));
    expect(window.localStorage.getItem('dashboard-view-ws-1')).toBe('dashboards');
    expect(screen.getByText('Mobile heatmap')).toBeInTheDocument();
  });

  it('has no deck when the workspace has no heatmap', () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    authState.workspaces = [{ id: 'ws-1', name: 'WS', heatmapEnabled: false }];
    renderPage();

    expect(screen.queryByTestId('mobile-swipe-deck')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Heatmap' })).not.toBeInTheDocument();
  });

  it('keeps the desktop strip on a wide screen', async () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByTestId('mobile-swipe-deck')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Heatmap' }));
    expect(await screen.findByText('Desktop heatmap')).toBeInTheDocument();
    expect(screen.queryByText('Mobile heatmap')).not.toBeInTheDocument();
  });
});
