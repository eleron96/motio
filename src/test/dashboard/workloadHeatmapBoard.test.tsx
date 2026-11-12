import React from 'react';
import { addDays, format } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('lays every month from last month to a year ahead into one scroll, a year at a time', async () => {
    await renderBoard();
    const months = shownMonths();
    const current = format(today, 'yyyy-MM');
    const previous = format(addDays(new Date(today.getFullYear(), today.getMonth(), 1), -1), 'yyyy-MM');
    const yearAhead = format(new Date(today.getFullYear() + 1, today.getMonth(), 1), 'yyyy-MM');
    expect(months).toEqual(expect.arrayContaining([previous, current, yearAhead]));
    // In order, with no gaps between them — one continuous calendar.
    expect([...months].sort()).toEqual(months);
    // Each year once, as the label beside its months (a January opens the window's middle year).
    expect(screen.getAllByTestId('heatmap-year').map((node) => node.textContent)).toEqual(
      expect.arrayContaining([String(today.getFullYear()), String(today.getFullYear() + 1)]),
    );
  });

  it('opens on the current month and scrolls back to it smoothly from Today', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(Element.prototype, 'scrollTo');
    await renderBoard();
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    scrollTo.mockRestore();
  });

  it('moves a row of months down and back up with the arrows, smoothly', async () => {
    const user = userEvent.setup();
    if (typeof Element.prototype.scrollBy !== 'function') {
      Element.prototype.scrollBy = (() => {}) as typeof Element.prototype.scrollBy;
    }
    const scrollBy = vi.spyOn(Element.prototype, 'scrollBy');
    await renderBoard();
    await user.click(screen.getByRole('button', { name: 'Later' }));
    await user.click(screen.getByRole('button', { name: 'Earlier' }));
    const calls = scrollBy.mock.calls.map(([options]) => options as ScrollToOptions);
    expect(calls).toHaveLength(2);
    expect(calls.every((options) => options.behavior === 'smooth')).toBe(true);
    // jsdom has no layout, so a row is 0px tall here: only the direction is checked.
    expect(Math.sign(calls[0].top ?? 0)).toBeGreaterThanOrEqual(0);
    expect(Math.sign(calls[1].top ?? 0)).toBeLessThanOrEqual(0);
    scrollBy.mockRestore();
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
