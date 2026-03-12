import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { format, parseISO } from 'date-fns';

type MockTooltipState = {
  label: string;
  payload: Array<Record<string, unknown>>;
};

let mockTooltipState: MockTooltipState = {
  label: '',
  payload: [],
};

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('recharts', async () => {
  const ReactModule = await import('react');

  const wrap = (testId: string) => ({ children }: { children?: React.ReactNode }) => (
    <div data-testid={testId}>{children}</div>
  );

  return {
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div data-testid="responsive">{children}</div>,
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
    XAxis: ({ dataKey, hide }: { dataKey?: string; hide?: boolean }) => (
      <div data-testid="x-axis" data-key={dataKey} data-hide={hide ? 'true' : 'false'} />
    ),
    Tooltip: ({ content }: { content?: React.ReactElement }) => (
      <div data-testid="chart-tooltip">
        {ReactModule.isValidElement(content)
          ? ReactModule.cloneElement(content, {
            active: true,
            label: mockTooltipState.label,
            payload: mockTooltipState.payload,
          })
          : null}
      </div>
    ),
    Legend: () => null,
  };
});

import { DashboardWidgetCard } from '@/features/dashboard/components/DashboardWidgetCard';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useLocaleStore } from '@/shared/store/localeStore';
import type { DashboardWidget, DashboardWidgetData } from '@/features/dashboard/types/dashboard';

const buildWidget = (overrides: Partial<DashboardWidget> = {}): DashboardWidget => ({
  id: 'widget-1',
  title: 'Widget',
  type: 'bar',
  period: 'week',
  groupBy: 'status',
  statusFilter: 'all',
  statusIds: [],
  showLegend: false,
  ...overrides,
});

describe('DashboardWidgetCard chart tooltip wiring', () => {
  beforeEach(() => {
    useLocaleStore.getState().setLocale('en');
    if (typeof globalThis.ResizeObserver === 'undefined') {
      globalThis.ResizeObserver = class {
        observe() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }
  });

  it('shows the hovered bar name and keeps the hidden x-axis label source', () => {
    mockTooltipState = {
      label: 'In progress',
      payload: [{
        dataKey: 'value',
        name: 'value',
        value: 7,
        color: '#0f172a',
        payload: { name: 'In progress', value: 7 },
      }],
    };

    const data: DashboardWidgetData = {
      total: 7,
      series: [{ name: 'In progress', value: 7 }],
    };

    render(
      <DashboardWidgetCard
        widget={buildWidget()}
        data={data}
        loading={false}
        error={null}
        editing={false}
      />,
    );

    const xAxis = screen.getByTestId('x-axis');
    expect(xAxis).toHaveAttribute('data-key', 'name');
    expect(xAxis).toHaveAttribute('data-hide', 'true');

    const tooltip = within(screen.getByTestId('chart-tooltip'));
    expect(tooltip.getByText('In progress')).toBeInTheDocument();
    expect(tooltip.getByText('Tasks')).toBeInTheDocument();
    expect(tooltip.getByText('7')).toBeInTheDocument();
  });

  it('shows the hovered date in area-chart tooltip and wires x-axis to time-series dates', () => {
    mockTooltipState = {
      label: '2026-03-12',
      payload: [{
        dataKey: 'series_done',
        name: 'Done',
        value: 3,
        color: '#0f172a',
        payload: { date: '2026-03-12', series_done: 3 },
      }],
    };

    const data: DashboardWidgetData = {
      total: 3,
      series: [{ name: 'Done', value: 3 }],
      timeSeries: [{ date: '2026-03-12', series_done: 3 }],
      seriesKeys: [{ key: 'series_done', label: 'Done' }],
    };

    render(
      <DashboardWidgetCard
        widget={buildWidget({ type: 'area' })}
        data={data}
        loading={false}
        error={null}
        editing={false}
      />,
    );

    const xAxis = screen.getByTestId('x-axis');
    expect(xAxis).toHaveAttribute('data-key', 'date');
    expect(xAxis).toHaveAttribute('data-hide', 'true');

    const expectedDate = format(parseISO('2026-03-12'), 'MMM d, yyyy', {
      locale: resolveDateFnsLocale('en'),
    });
    const tooltip = within(screen.getByTestId('chart-tooltip'));
    expect(tooltip.getByText(expectedDate)).toBeInTheDocument();
    expect(tooltip.getByText('Done')).toBeInTheDocument();
    expect(tooltip.getByText('3')).toBeInTheDocument();
  });
});
