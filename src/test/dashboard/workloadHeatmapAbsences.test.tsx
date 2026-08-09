import React from 'react';
import { addDays, format } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The board renders <Trans> children verbatim, which is exactly what we assert on.
vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
  Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// Holidays would otherwise be fetched; an empty map keeps the day a plain workday.
vi.mock('@/features/planner/hooks/useHolidayMap', () => ({
  useHolidayMap: () => ({ holidayMap: {} }),
  normalizeHolidayCountryCode: () => 'RU',
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  dashboard: {
    heatmap: { days: [] as { date: string; taskCount: number }[], rangeKey: 'k', loading: false, error: null },
    timeOff: { records: [] as { id: string; assigneeId: string; startDate: string; endDate: string }[], rangeKey: 'k', loading: false, error: null },
    loadHeatmap: vi.fn(async () => {}),
    loadTimeOff: vi.fn(async () => {}),
    setHeatmapAutoCapacity: vi.fn(),
    milestones: [] as unknown[],
    assignees: [] as { id: string; name: string; isActive: boolean }[],
    projects: [] as unknown[],
  },
}));

vi.mock('@/features/dashboard/store/dashboardStore', () => ({
  useDashboardStore: (selector?: (state: unknown) => unknown) => (
    typeof selector === 'function' ? selector(mocks.dashboard) : mocks.dashboard
  ),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      currentWorkspaceId: 'ws-1',
      // Capacity is pinned so the assertions don't depend on auto-calibration.
      workspaces: [{ id: 'ws-1', name: 'WS', holidayCountry: 'RU', heatmapCapacityPerPerson: 5 }],
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      requestScrollToDate: vi.fn(),
      setCurrentDate: vi.fn(),
      setTimelineAttentionDate: vi.fn(),
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (selector?: (state: unknown) => unknown) => {
    const state = { locale: 'en' };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

// jsdom has no element scrolling; the board scrolls the month strip on mount.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = (() => {}) as typeof Element.prototype.scrollTo;
}

// Six people, a fixed day inside the board window, 20 tasks on it: a full team of
// six is at 67%, four available makes it a full day (100%).
const TEAM = Array.from({ length: 6 }, (_, i) => ({
  id: `a${i + 1}`,
  name: `Person ${i + 1}`,
  isActive: true,
}));

// Returns the day's popover, so assertions never pick up the board legend (which
// also says "Load") instead of the day reading.
const openDayPopover = async (iso: string): Promise<HTMLElement> => {
  const user = userEvent.setup();
  const { WorkloadHeatmapBoard } = await import('@/features/dashboard/components/WorkloadHeatmapBoard');
  render(<WorkloadHeatmapBoard />);
  const label = format(new Date(`${iso}T12:00:00Z`), 'd MMMM yyyy');
  await user.click(screen.getByRole('button', { name: label }));
  return screen.findByRole('dialog');
};

describe('WorkloadHeatmapBoard with absences', () => {
  // A weekday a couple of weeks out: inside the window, never a weekend.
  const target = (() => {
    let date = addDays(new Date(), 14);
    while (date.getDay() === 0 || date.getDay() === 6) date = addDays(date, 1);
    return format(date, 'yyyy-MM-dd');
  })();

  beforeEach(() => {
    mocks.dashboard.assignees = [...TEAM];
    mocks.dashboard.heatmap = {
      days: [{ date: target, taskCount: 20 }],
      rangeKey: 'k',
      loading: false,
      error: null,
    };
    mocks.dashboard.timeOff = { records: [], rangeKey: 'k', loading: false, error: null };
    mocks.dashboard.loadTimeOff.mockClear();
  });

  it('loads absences for the same window as the heatmap', async () => {
    await openDayPopover(target);
    expect(mocks.dashboard.loadTimeOff).toHaveBeenCalled();
    const [workspaceId, startIso, endIso] = mocks.dashboard.loadTimeOff.mock.calls[0] as unknown as string[];
    expect(workspaceId).toBe('ws-1');
    expect(mocks.dashboard.loadHeatmap.mock.calls[0]).toEqual([workspaceId, startIso, endIso]);
  });

  it('divides the day by the whole team when nobody is away', async () => {
    const popover = await openDayPopover(target);
    // (20 / 6) / 5 = 0.67
    expect(within(popover).getByText(/Load/)).toBeInTheDocument();
    expect(within(popover).getByText(/67%/)).toBeInTheDocument();
    expect(within(popover).queryByText(/Away:/)).not.toBeInTheDocument();
  });

  it('divides by the people actually there and says how many are away', async () => {
    mocks.dashboard.timeOff = {
      records: [
        { id: 't1', assigneeId: 'a1', startDate: target, endDate: target },
        { id: 't2', assigneeId: 'a2', startDate: target, endDate: target },
      ],
      rangeKey: 'k',
      loading: false,
      error: null,
    };

    const popover = await openDayPopover(target);
    // (20 / 4) / 5 = 1.00 — the same tasks now fill the day
    expect(within(popover).getByText(/100%/)).toBeInTheDocument();
    expect(within(popover).getByText('Away: 2 of 6')).toBeInTheDocument();
  });

  it('ignores the absence of a disabled assignee', async () => {
    mocks.dashboard.assignees = [...TEAM, { id: 'gone', name: 'Gone', isActive: false }];
    mocks.dashboard.timeOff = {
      records: [{ id: 't1', assigneeId: 'gone', startDate: target, endDate: target }],
      rangeKey: 'k',
      loading: false,
      error: null,
    };

    const popover = await openDayPopover(target);
    expect(within(popover).getByText(/67%/)).toBeInTheDocument();
    expect(within(popover).queryByText(/Away:/)).not.toBeInTheDocument();
  });

  it('shows a day with the whole team away as non-working, not as an overload', async () => {
    mocks.dashboard.timeOff = {
      records: TEAM.map((person) => ({
        id: `t-${person.id}`,
        assigneeId: person.id,
        startDate: target,
        endDate: target,
      })),
      rangeKey: 'k',
      loading: false,
      error: null,
    };

    const popover = await openDayPopover(target);
    expect(within(popover).getByText('The whole team is away')).toBeInTheDocument();
    expect(within(popover).queryByText(/Load/)).not.toBeInTheDocument();
    expect(within(popover).queryByText(/overloaded/)).not.toBeInTheDocument();
    expect(within(popover).queryByText(/%/)).not.toBeInTheDocument();
  });
});
