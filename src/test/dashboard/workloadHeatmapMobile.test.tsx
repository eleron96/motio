import React from 'react';
import {
  addDays,
  addWeeks,
  eachMonthOfInterval,
  endOfWeek,
  format,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  dashboard: {
    heatmap: { days: [] as { date: string; taskCount: number }[], rangeKey: 'k', loading: false, error: null },
    timeOff: { records: [] as { id: string; assigneeId: string; startDate: string; endDate: string }[], rangeKey: 'k', loading: false, error: null },
    loadHeatmap: vi.fn(async () => {}),
    loadTimeOff: vi.fn(async () => {}),
    setHeatmapAutoCapacity: vi.fn(),
    milestones: [] as { id: string; title: string; projectId: string; date: string; includeInWorkload: boolean }[],
    assignees: [] as { id: string; name: string; isActive: boolean }[],
    projects: [] as { id: string; name: string }[],
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
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

// jsdom has neither element scrolling nor an IntersectionObserver; the list
// scrolls itself to the current month and watches that month leave the screen.
const scrollTo = vi.fn();
Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo;

type ObserverStub = {
  callback: IntersectionObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};
const observers: ObserverStub[] = [];
class IntersectionObserverStub {
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = '';
  thresholds = [];
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
}
Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  writable: true,
  value: IntersectionObserverStub,
});

const TEAM = Array.from({ length: 6 }, (_, i) => ({
  id: `a${i + 1}`,
  name: `Person ${i + 1}`,
  isActive: true,
}));

const renderBoard = async () => {
  const { WorkloadHeatmapMobile } = await import('@/features/dashboard/components/WorkloadHeatmapMobile');
  return render(<WorkloadHeatmapMobile />);
};

const dayLabel = (iso: string) => format(new Date(`${iso}T12:00:00Z`), 'd MMMM yyyy');

describe('WorkloadHeatmapMobile', () => {
  // A weekday a couple of weeks out: inside the window, never a weekend.
  const target = (() => {
    let date = addDays(new Date(), 14);
    while (date.getDay() === 0 || date.getDay() === 6) date = addDays(date, 1);
    return format(date, 'yyyy-MM-dd');
  })();

  beforeEach(() => {
    observers.length = 0;
    scrollTo.mockClear();
    mocks.navigate.mockClear();
    mocks.dashboard.assignees = [...TEAM];
    mocks.dashboard.heatmap = {
      days: [{ date: target, taskCount: 20 }],
      rangeKey: 'k',
      loading: false,
      error: null,
    };
    mocks.dashboard.timeOff = { records: [], rangeKey: 'k', loading: false, error: null };
    mocks.dashboard.milestones = [];
    mocks.dashboard.projects = [];
  });

  it('stacks the whole window month by month, top to bottom', async () => {
    await renderBoard();

    const now = new Date();
    const expected = eachMonthOfInterval({
      start: startOfWeek(subWeeks(now, 13), { weekStartsOn: 1 }),
      end: endOfWeek(addWeeks(now, 26), { weekStartsOn: 1 }),
    }).map((month) => format(month, 'yyyy-MM'));

    const rendered = screen.getAllByTestId('heatmap-month').map((node) => node.dataset.month);
    expect(rendered).toEqual(expected);
    // Every month carries its own weekday row, since the header of one month is
    // never on screen while another month's weeks are.
    expect(screen.getAllByText('Mon')).toHaveLength(expected.length);
  });

  it('opens on the current month rather than at the top of the history', async () => {
    await renderBoard();

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('reads a day as a sheet on tap', async () => {
    mocks.dashboard.projects = [{ id: 'p1', name: 'Brand Refresh' }];
    // Not load-bearing, so the day reads exactly as its task count says.
    mocks.dashboard.milestones = [
      { id: 'm1', title: 'Deliver the guidelines', projectId: 'p1', date: target, includeInWorkload: false },
    ];
    const user = userEvent.setup();
    await renderBoard();

    await user.click(screen.getByRole('button', { name: dayLabel(target) }));

    const sheet = await screen.findByRole('dialog');
    // (20 / 6) / 5 = 0.67
    expect(sheet).toHaveTextContent('Load67%');
    expect(within(sheet).getByText('Deliver the guidelines')).toBeInTheDocument();
    expect(within(sheet).getByText('Brand Refresh')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: /Deliver the guidelines/ }));
    expect(mocks.navigate).toHaveBeenCalledWith('/app/projects?milestone=m1');
  });

  it('walks over to the timeline from the sheet', async () => {
    const user = userEvent.setup();
    await renderBoard();

    await user.click(screen.getByRole('button', { name: dayLabel(target) }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Open on timeline' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/app');
  });

  it('offers a way back once the current month has scrolled out of view', async () => {
    const user = userEvent.setup();
    await renderBoard();

    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
    expect(observers).toHaveLength(1);

    act(() => {
      observers[0].callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        observers[0] as unknown as IntersectionObserver,
      );
    });
    const pill = screen.getByRole('button', { name: 'Today' });

    scrollTo.mockClear();
    await user.click(pill);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));

    act(() => {
      observers[0].callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observers[0] as unknown as IntersectionObserver,
      );
    });
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
  });
});
