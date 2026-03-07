import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineGrid } from '@/features/planner/components/timeline/TimelineGrid';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const { plannerState, authState } = vi.hoisted(() => ({
  plannerState: {
    tasks: [],
    milestones: [],
    projects: [],
    assignees: [
      { id: 'a1', name: 'Alice Baker', isActive: true, userId: 'u1' },
      { id: 'a2', name: 'Bob Carter', isActive: true, userId: 'u2' },
    ],
    memberGroupAssignments: [],
    viewMode: 'week',
    groupMode: 'assignee',
    currentDate: '2026-03-10',
    scrollTargetDate: null,
    scrollRequestId: 0,
    filters: {
      projectIds: [],
      assigneeIds: [],
      groupIds: [],
      statusIds: [],
      typeIds: [],
      tagIds: [],
      hideUnassigned: false,
    },
    highlightedTaskId: null,
    timelineAttentionDate: null,
    setCurrentDate: vi.fn(),
    requestScrollToDate: vi.fn(),
    setTimelineAttentionDate: vi.fn(),
    markTimelineInteraction: vi.fn(),
  },
  authState: {
    user: { id: 'u1' },
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

vi.mock('@/shared/lib/dateFnsLocale', () => ({
  resolveDateFnsLocale: () => undefined,
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/hooks/useTodayKey', () => ({
  useTodayKey: () => '2026-03-10',
}));

vi.mock('@/features/planner/components/timeline/TimelineHeader', () => ({
  TimelineHeader: () => <div data-testid="timeline-header" />,
}));

vi.mock('@/features/planner/components/timeline/TimelineRow', () => ({
  TimelineRow: ({ rowId, height, children }: { rowId: string; height: number; children: React.ReactNode }) => (
    <div data-row-id={rowId} style={{ height }}>
      {children}
    </div>
  ),
}));

vi.mock('@/features/planner/components/timeline/MilestoneDialog', () => ({
  MilestoneDialog: () => null,
}));

describe('TimelineGrid scroll surface', () => {
  it('keeps sidebar rows and task rows inside one shared vertical scroll owner', () => {
    render(<TimelineGrid />);

    const scrollOwner = screen.getByTestId('timeline-scroll-container');

    expect(scrollOwner).toHaveAttribute('data-timeline-scroll-owner', 'vertical');
    expect(scrollOwner).toContainElement(screen.getByTestId('timeline-sidebar-header'));
    expect(scrollOwner).toContainElement(screen.getByTestId('timeline-sidebar-row-a1'));
    expect(scrollOwner).toContainElement(screen.getByTestId('timeline-sidebar-row-a2'));
    expect(scrollOwner).toContainElement(screen.getByTestId('timeline-task-row-a1'));
    expect(scrollOwner).toContainElement(screen.getByTestId('timeline-task-row-a2'));
    expect(document.querySelectorAll('[data-timeline-scroll-owner="vertical"]')).toHaveLength(1);
  });
});
