import React from 'react';
import { addDays, format } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useInstanceSettingsStore } from '@/shared/store/instanceSettingsStore';

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
    assignees: [] as { id: string; name: string; isActive: boolean; joinedOn?: string | null; leftOn?: string | null }[],
    projects: [] as unknown[],
    personCapacities: null as { workspaceId: string; values: Record<string, number> } | null,
    loadPersonCapacities: vi.fn(async () => {}),
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
  // Named by the date first; the load and its level follow.
  const label = new RegExp(`^${format(new Date(`${iso}T12:00:00Z`), 'd MMMM yyyy')}\\b`);
  // The grid opens on the current month; a past day is reached with "Earlier",
  // the way a person would get to it.
  for (let step = 0; step < 6 && !screen.queryByRole('button', { name: label }); step += 1) {
    await user.click(screen.getByRole('button', { name: 'Earlier' }));
  }
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
    mocks.dashboard.personCapacities = null;
    mocks.dashboard.loadPersonCapacities.mockClear();
    useInstanceSettingsStore.setState((state) => ({ values: { ...state.values, 'heatmap.personCapacity': false } }));
  });

  describe('each person\'s share (server setting heatmap.personCapacity)', () => {
    // Two of the six coordinate and take no tasks: 0% each.
    const coordinatorsAtZero = () => {
      mocks.dashboard.personCapacities = { workspaceId: 'ws-1', values: { a1: 0, a2: 0 } };
    };

    it('ignores the shares while the setting is off: everyone counts in full, as before', async () => {
      coordinatorsAtZero();
      const popover = await openDayPopover(target);
      expect(within(popover).getByText(/67%/)).toBeInTheDocument();
      expect(mocks.dashboard.loadPersonCapacities).not.toHaveBeenCalled();
    });

    it('counts the team as the sum of shares when the setting is on', async () => {
      coordinatorsAtZero();
      useInstanceSettingsStore.setState((state) => ({ values: { ...state.values, 'heatmap.personCapacity': true } }));
      const popover = await openDayPopover(target);
      // (20 / 4 people's worth) / 5 = 1.00
      expect(within(popover).getByText(/100%/)).toBeInTheDocument();
      expect(mocks.dashboard.loadPersonCapacities).toHaveBeenCalledWith('ws-1');
    });

    it('does not shrink the team when a 0% person is away', async () => {
      coordinatorsAtZero();
      useInstanceSettingsStore.setState((state) => ({ values: { ...state.values, 'heatmap.personCapacity': true } }));
      mocks.dashboard.timeOff = {
        records: [{ id: 't1', assigneeId: 'a1', startDate: target, endDate: target }],
        rangeKey: 'k',
        loading: false,
        error: null,
      };
      const popover = await openDayPopover(target);
      expect(within(popover).getByText(/100%/)).toBeInTheDocument();
      expect(within(popover).getByText('Away: 1 of 6')).toBeInTheDocument();
    });
  });

  describe('the team changes', () => {
    // A weekday a couple of weeks back, and a long-running workspace.
    const past = (() => {
      let date = addDays(new Date(), -14);
      while (date.getDay() === 0 || date.getDay() === 6) date = addDays(date, -1);
      return format(date, 'yyyy-MM-dd');
    })();
    const veterans = TEAM.map((person) => ({ ...person, joinedOn: '2020-01-10' }));

    beforeEach(() => {
      mocks.dashboard.heatmap = {
        days: [{ date: past, taskCount: 20 }, { date: target, taskCount: 20 }],
        rangeKey: 'k',
        loading: false,
        error: null,
      };
    });

    it('keeps a past day on the team it had when two people have left since', async () => {
      const leftOn = format(addDays(new Date(), -3), 'yyyy-MM-dd');
      mocks.dashboard.assignees = veterans.map((person, index) => (
        index < 2 ? { ...person, isActive: false, leftOn } : person
      ));
      // Six people then: (20 / 6) / 5 = 0.67 — not the 100% of today's four.
      const popover = await openDayPopover(past);
      expect(within(popover).getByText(/67%/)).toBeInTheDocument();
    });

    it('divides the days ahead by the team as it is now', async () => {
      const leftOn = format(addDays(new Date(), -3), 'yyyy-MM-dd');
      mocks.dashboard.assignees = veterans.map((person, index) => (
        index < 2 ? { ...person, isActive: false, leftOn } : person
      ));
      const popover = await openDayPopover(target);
      expect(within(popover).getByText(/100%/)).toBeInTheDocument();
    });

    it('does not cool down a past day when two people have joined since', async () => {
      const joinedOn = format(addDays(new Date(), -3), 'yyyy-MM-dd');
      mocks.dashboard.assignees = veterans.map((person, index) => (
        index < 2 ? { ...person, joinedOn } : person
      ));
      // Four people then: a full day, not the 67% of today's six.
      const popover = await openDayPopover(past);
      expect(within(popover).getByText(/100%/)).toBeInTheDocument();
    });
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
