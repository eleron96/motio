import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlannerPage from '@/features/planner/pages/PlannerPage';
import { getTimelineSidebarWidthStorageKey } from '@/features/planner/lib/timelineSidebarWidthStorage';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    loadWorkspaceData: vi.fn(),
    loading: false,
    error: null,
    loadedRange: null,
    tasks: [],
    projects: [],
    assignees: [],
    statuses: [],
    taskTypes: [],
    tags: [],
    milestones: [],
    filters: {
      projectIds: [],
      assigneeIds: [],
      groupIds: [],
      statusIds: [],
      typeIds: [],
      tagIds: [],
      hideUnassigned: false,
    },
    setFilters: vi.fn(),
    clearFilterCriteria: vi.fn(),
    clearFilters: vi.fn(),
    viewMode: 'week',
    currentDate: '2026-03-14',
    setCurrentDate: vi.fn(),
    requestScrollToDate: vi.fn(),
    scrollTargetDate: null,
    highlightedTaskId: null,
    setHighlightedTaskId: vi.fn(),
  },
  authState: {
    user: { id: 'user-1' },
    currentWorkspaceId: 'workspace-1',
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

vi.mock('@/features/planner/components/timeline/TimelineGrid', () => ({
  TimelineGrid: ({
    sidebarWidth,
    onSidebarWidthChange,
    onSidebarWidthReset,
  }: {
    sidebarWidth?: number | null;
    onSidebarWidthChange?: (width: number) => void;
    onSidebarWidthReset?: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onSidebarWidthChange?.(333)}>
        resize timeline sidebar
      </button>
      <button type="button" onClick={() => onSidebarWidthReset?.()}>
        reset timeline sidebar
      </button>
      <span data-testid="timeline-sidebar-width">
        {sidebarWidth === undefined ? 'undefined' : sidebarWidth === null ? 'null' : String(sidebarWidth)}
      </span>
    </div>
  ),
}));

vi.mock('@/features/planner/components/timeline/CalendarTimeline', () => ({
  CalendarTimeline: () => <div data-testid="calendar-timeline" />,
}));

vi.mock('@/features/planner/components/timeline/TimelineControls', () => ({
  TimelineControls: () => <div data-testid="timeline-controls" />,
}));

vi.mock('@/features/planner/components/FilterPanel', () => ({
  FilterPanel: () => <div data-testid="filter-panel" />,
}));

vi.mock('@/features/planner/components/TaskDetailPanel', () => ({
  TaskDetailPanel: () => null,
}));

vi.mock('@/features/planner/components/AddTaskDialog', () => ({
  AddTaskDialog: () => null,
}));

vi.mock('@/features/planner/hooks/usePlannerLiveSync', () => ({
  usePlannerLiveSync: vi.fn(),
}));

vi.mock('@/shared/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Plus: () => <svg aria-hidden="true" />,
}));

vi.mock('@/features/workspace/components/WorkspacePageHeader', () => ({
  WorkspacePageHeader: ({ primaryAction }: { primaryAction?: React.ReactNode }) => (
    <div data-testid="workspace-page-header">{primaryAction}</div>
  ),
}));

vi.mock('@/features/workspace/components/WorkspaceCommonDialogs', () => ({
  WorkspaceCommonDialogs: () => null,
}));

vi.mock('@/shared/lib/seo/usePageSeo', () => ({
  usePageSeo: vi.fn(),
}));

describe('PlannerPage timeline sidebar width', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('persists a new width when TimelineGrid reports sidebar resize', async () => {
    render(<PlannerPage />);

    fireEvent.click(screen.getByRole('button', { name: 'resize timeline sidebar' }));

    const storageKey = getTimelineSidebarWidthStorageKey(authState.user.id, authState.currentWorkspaceId);

    await waitFor(() => {
      expect(window.localStorage.getItem(storageKey)).toBe('333');
    });

    expect(screen.getByTestId('timeline-sidebar-width')).toHaveTextContent('333');
  });
});
