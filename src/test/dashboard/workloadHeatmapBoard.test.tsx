import React from 'react';
import { addDays, format } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

// jsdom has no element scrolling.
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = (() => {}) as typeof Element.prototype.scrollTo;
}

const TEAM = Array.from({ length: 6 }, (_, i) => ({ id: `a${i + 1}`, name: `Person ${i + 1}`, isActive: true }));
const iso = (date: Date) => format(date, 'yyyy-MM-dd');
const today = new Date();

// Six people at 5 tasks each: 30 tasks is a full day, 42 is 140%.
const loadDays = (taskCount: number, days: number) => Array.from({ length: days }, (_, offset) => ({
  date: iso(addDays(today, offset)),
  taskCount,
}));

const renderBoard = async () => {
  const { WorkloadHeatmapBoard } = await import('@/features/dashboard/components/WorkloadHeatmapBoard');
  render(<WorkloadHeatmapBoard />);
};

const shownMonths = () => screen.getAllByTestId('heatmap-month').map((node) => node.getAttribute('data-month'));

describe('WorkloadHeatmapBoard month grid', () => {
  beforeEach(() => {
    mocks.dashboard.assignees = TEAM;
    mocks.dashboard.heatmap = { ...mocks.dashboard.heatmap, days: [] };
  });

  it('opens with last month and then the current one, and pages without losing the way back', async () => {
    const user = userEvent.setup();
    await renderBoard();
    const current = format(today, 'yyyy-MM');
    const previous = format(addDays(new Date(today.getFullYear(), today.getMonth(), 1), -1), 'yyyy-MM');
    expect(shownMonths().slice(0, 2)).toEqual([previous, current]);

    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(shownMonths()).not.toContain(previous);

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(shownMonths().slice(0, 2)).toEqual([previous, current]);
  });

  it('scrolls a month at a time like a calendar: down goes forward, up goes back', async () => {
    await renderBoard();
    const grid = screen.getByTestId('heatmap-months');
    const start = shownMonths();

    fireEvent.wheel(grid, { deltaY: 100 });
    expect(shownMonths()[0]).toBe(start[1]);

    fireEvent.wheel(grid, { deltaY: -100, timeStamp: 1000 });
    expect(shownMonths()).toEqual(start);
  });

  it('adds trackpad scrolling up before it moves, so a small nudge does nothing', async () => {
    await renderBoard();
    const grid = screen.getByTestId('heatmap-months');
    const start = shownMonths();
    fireEvent.wheel(grid, { deltaY: 30 });
    expect(shownMonths()).toEqual(start);
    fireEvent.wheel(grid, { deltaY: 30 });
    fireEvent.wheel(grid, { deltaY: 25 });
    expect(shownMonths()[0]).toBe(start[1]);
  });

  it('moves exactly one month per wheel notch, however big the notch', async () => {
    await renderBoard();
    const grid = screen.getByTestId('heatmap-months');
    const start = shownMonths();
    for (let notch = 0; notch < 3; notch += 1) fireEvent.wheel(grid, { deltaY: 120 });
    expect(shownMonths()[0]).toBe(start[3]);
  });

  it('counts notches the browser merged into one event, and a Firefox notch in lines', async () => {
    await renderBoard();
    const grid = screen.getByTestId('heatmap-months');
    const start = shownMonths();
    fireEvent.wheel(grid, { deltaY: 300 });
    expect(shownMonths()[0]).toBe(start[3]);
    fireEvent.wheel(grid, { deltaY: -3, deltaMode: 1 });
    expect(shownMonths()[0]).toBe(start[2]);
  });

  it('reaches a year ahead', async () => {
    const user = userEvent.setup();
    await renderBoard();
    const later = screen.getByRole('button', { name: 'Later' });
    for (let step = 0; step < 12 && !(later as HTMLButtonElement).disabled; step += 1) await user.click(later);
    const yearAhead = format(new Date(today.getFullYear() + 1, today.getMonth(), 1), 'yyyy-MM');
    expect(shownMonths()).toContain(yearAhead);
  });

  it('says when the current overload ends, counting working days only', async () => {
    mocks.dashboard.heatmap = { ...mocks.dashboard.heatmap, days: loadDays(42, 21) };
    await renderBoard();
    let lastHot = addDays(today, 20);
    while ([0, 6].includes(lastHot.getDay())) lastHot = addDays(lastHot, -1);
    // With today on a weekend the first working day decides; it is overloaded too.
    expect(screen.getByText(`Overloaded until ${format(lastHot, 'd MMMM')}, calmer after that.`)).toBeInTheDocument();
  });

  it('says so plainly when there is no overload ahead', async () => {
    mocks.dashboard.heatmap = { ...mocks.dashboard.heatmap, days: loadDays(20, 60) };
    await renderBoard();
    expect(screen.getByText('No overload in the coming months.')).toBeInTheDocument();
  });

  it('names how bad an overloaded day is, not just that it is overloaded', async () => {
    mocks.dashboard.heatmap = { ...mocks.dashboard.heatmap, days: loadDays(42, 14) };
    await renderBoard();
    expect(screen.getAllByRole('button', { name: /140%, heavily overloaded$/ }).length).toBeGreaterThan(0);
  });
});
