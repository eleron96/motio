import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * An empty timeline used to say nothing at all — one row with your own name and
 * silence, with no hint that a double-click creates a task. The hint appears
 * only when the workspace is genuinely empty, never while data is loading and
 * never as a verdict on someone's filters.
 */

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    tasks: [] as unknown[],
    loading: false,
    milestones: [],
    projects: [],
    assignees: [{ id: 'a1', name: 'Alice Baker', isActive: true, userId: 'u1' }],
    memberGroupAssignments: [],
    viewMode: 'week',
    groupMode: 'assignee',
    currentDate: '2026-03-10',
    scrollTargetDate: null,
    scrollRequestId: 0,
    filters: {
      projectIds: [], assigneeIds: [], groupIds: [],
      statusIds: [], typeIds: [], tagIds: [], hideUnassigned: false,
    },
    highlightedTaskId: null,
    highlightedTaskRowAssigneeId: null,
    timelineAttentionDate: null,
    setCurrentDate: vi.fn(),
    requestScrollToDate: vi.fn(),
    setTimelineAttentionDate: vi.fn(),
    markTimelineInteraction: vi.fn(),
  },
  authState: {
    user: { id: 'u1' },
    members: [],
    currentWorkspaceRole: 'admin',
    currentWorkspaceId: 'ws-1',
    workspaces: [{ id: 'ws-1', holidayCountry: 'RU' }],
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector: (state: typeof plannerState) => unknown) => selector(plannerState),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

vi.mock('@/features/planner/hooks/useFilteredAssignees', () => ({
  useFilteredAssignees: (assignees: typeof plannerState.assignees) => assignees,
}));

vi.mock('@/features/planner/hooks/useHolidayMap', () => ({
  useHolidayMap: () => ({ holidayDates: new Set<string>() }),
  normalizeHolidayCountryCode: (value: string | undefined) => value ?? 'RU',
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (selector: (state: { locale: string }) => unknown) => selector({ locale: 'en' }),
}));

vi.mock('@/shared/lib/dateFnsLocale', () => ({ resolveDateFnsLocale: () => undefined }));
vi.mock('@/shared/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/shared/hooks/useTodayKey', () => ({ useTodayKey: () => '2026-03-10' }));

vi.mock('@/features/planner/components/timeline/TimelineHeader', () => ({
  TimelineHeader: () => <div data-testid="timeline-header" />,
}));

vi.mock('@/features/planner/components/timeline/TimelineRow', () => ({
  TimelineRow: ({ rowId, children }: { rowId: string; children: React.ReactNode }) => (
    <div data-row-id={rowId}>{children}</div>
  ),
}));

vi.mock('@/features/planner/components/timeline/MilestoneDialog', () => ({
  MilestoneDialog: () => null,
}));

// Полоска задачи тянет за собой справочники статусов и типов — для этой
// проверки важен лишь сам факт, что задача есть.
vi.mock('@/features/planner/components/timeline/TaskBar', () => ({
  TaskBar: ({ task }: { task: { id: string } }) => <div data-task-id={task.id} />,
}));

import { TimelineGrid } from '@/features/planner/components/timeline/TimelineGrid';

describe('TimelineGrid empty hint', () => {
  beforeEach(() => {
    plannerState.tasks = [];
    plannerState.loading = false;
    authState.currentWorkspaceRole = 'admin';
  });

  it('tells a newcomer how the first task is made', () => {
    render(<TimelineGrid />);

    const hint = screen.getByTestId('timeline-empty-hint');
    expect(hint).toHaveTextContent('Double-click any day to create one.');
  });

  it('stays out of the way while the workspace is still loading', () => {
    plannerState.loading = true;
    render(<TimelineGrid />);

    expect(screen.queryByTestId('timeline-empty-hint')).not.toBeInTheDocument();
  });

  it('disappears as soon as there is a task', () => {
    plannerState.tasks = [{
      id: 't1',
      title: 'First task',
      projectId: null,
      assigneeIds: ['a1'],
      startDate: '2026-03-10',
      endDate: '2026-03-10',
      statusId: 's1',
      typeId: 'ty1',
      priority: null,
      tagIds: [],
      description: null,
      repeatId: null,
    }];
    render(<TimelineGrid />);

    expect(screen.queryByTestId('timeline-empty-hint')).not.toBeInTheDocument();
  });

  it('does not promise a viewer an action they cannot take', () => {
    authState.currentWorkspaceRole = 'viewer';
    render(<TimelineGrid />);

    const hint = screen.getByTestId('timeline-empty-hint');
    expect(hint).toHaveTextContent('No tasks yet.');
    expect(hint).not.toHaveTextContent('Double-click');
  });
});
