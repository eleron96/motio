import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('recharts', async () => {
  const wrap = (testId: string) => ({ children }: { children?: React.ReactNode }) => (
    <div data-testid={testId}>{children}</div>
  );

  return {
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    BarChart: wrap('bar-chart'),
    LineChart: wrap('line-chart'),
    AreaChart: wrap('area-chart'),
    PieChart: wrap('pie-chart'),
    CartesianGrid: () => null,
    Cell: () => null,
    Bar: wrap('bar-series'),
    Line: wrap('line-series'),
    Area: wrap('area-series'),
    Pie: wrap('pie-series'),
    YAxis: () => null,
    XAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

import { DashboardWidgetCard } from '@/features/dashboard/components/DashboardWidgetCard';
import { buildPersonColorMap, TIME_OFF_PALETTE } from '@/features/planner/lib/timeOffPalette';
import { getBarPalette } from '@/features/dashboard/lib/dashboardUtils';
import { useLocaleStore } from '@/shared/store/localeStore';
import type {
  DashboardAssigneeOption,
  DashboardWidget,
  DashboardWidgetData,
} from '@/features/dashboard/types/dashboard';

const PICKED_BLUE = '#a7ccf1';

const assignees: DashboardAssigneeOption[] = [
  { id: 'assignee-1', name: 'Emma', isActive: true, color: PICKED_BLUE },
  { id: 'assignee-2', name: 'Ben', isActive: true },
];

const widget = (overrides: Partial<DashboardWidget> = {}): DashboardWidget => ({
  id: 'widget-1',
  title: 'By person',
  type: 'bar',
  period: 'week',
  groupBy: 'assignee',
  statusFilter: 'all',
  statusIds: [],
  showLegend: true,
  ...overrides,
});

const data: DashboardWidgetData = {
  total: 5,
  series: [
    { name: 'Emma', value: 3, groupId: 'assignee-1' },
    { name: 'Ben', value: 2, groupId: 'assignee-2' },
  ],
};

// The legend swatch is the cheapest place to read the colour a series was given.
const swatchColors = () => (
  Array.from(document.querySelectorAll<HTMLElement>('[style*="background-color"]'))
    .map((node) => node.style.backgroundColor)
    .filter(Boolean)
);

const renderCard = (overrides: Partial<DashboardWidget> = {}) => render(
  <DashboardWidgetCard
    widget={widget(overrides)}
    data={data}
    loading={false}
    error={null}
    editing={false}
    assignees={assignees}
  />,
);

/**
 * What the DOM will report for a colour. Not a hand-rolled conversion on
 * purpose: jsdom's CSS engine mangles hsl() into grey, so comparing a raw
 * palette string against a rendered one would fail on a correct component.
 */
const asRendered = (color: string) => {
  const probe = document.createElement('div');
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor;
};

describe('DashboardWidgetCard person colours', () => {
  beforeEach(() => {
    useLocaleStore.getState().setLocale('en');
    if (typeof globalThis.ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe() {}
        disconnect() {}
      } as unknown as typeof ResizeObserver;
    }
  });

  it('paints a person in the colour they picked', () => {
    renderCard();

    expect(screen.getByText('Emma')).toBeInTheDocument();
    expect(swatchColors()).toContain(asRendered(PICKED_BLUE));
  });

  it('gives a person without a picked colour the same automatic one as the calendar', () => {
    renderCard();

    // Ben has no colour of his own, so he gets his calendar slot — the map is
    // the calendar's own, which is what keeps the two views in sync.
    const calendarColor = buildPersonColorMap(assignees).get('assignee-2');
    expect(TIME_OFF_PALETTE).toContain(calendarColor);
    expect(swatchColors()).toContain(asRendered(calendarColor as string));
  });

  it('falls back to the widget palette when the toggle is off', () => {
    renderCard({ useAssigneeColors: false });

    const palette = getBarPalette(undefined);
    const colors = swatchColors();

    expect(colors).not.toContain(asRendered(PICKED_BLUE));
    expect(colors).toContain(asRendered(palette[0]));
  });

  it('leaves other groupings on the palette even with the toggle on', () => {
    render(
      <DashboardWidgetCard
        widget={widget({ groupBy: 'project', useAssigneeColors: true })}
        data={{
          total: 3,
          series: [{ name: 'Alpha', value: 3, groupId: 'assignee-1' }],
        }}
        loading={false}
        error={null}
        editing={false}
        assignees={assignees}
      />,
    );

    // Same id as a person on purpose: grouping by project must not borrow a
    // person's colour just because the ids happen to match.
    expect(swatchColors()).not.toContain(asRendered(PICKED_BLUE));
  });
});
