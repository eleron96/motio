import { describe, expect, it } from 'vitest';
import { format, parseISO } from 'date-fns';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import {
  formatDashboardChartTooltipLabel,
  getDashboardChartLabelDataKey,
} from '@/features/dashboard/lib/dashboardChartLabels';

describe('dashboard chart labels', () => {
  it('uses category names for bar-chart tooltip labels', () => {
    expect(getDashboardChartLabelDataKey('bar')).toBe('name');
    expect(
      formatDashboardChartTooltipLabel('bar', 'In progress', resolveDateFnsLocale('en')),
    ).toBe('In progress');
  });

  it('formats time-series tooltip labels as localized dates', () => {
    const dateLocale = resolveDateFnsLocale('en');
    expect(getDashboardChartLabelDataKey('area')).toBe('date');
    expect(getDashboardChartLabelDataKey('line')).toBe('date');
    expect(
      formatDashboardChartTooltipLabel('area', '2026-03-12', dateLocale),
    ).toBe(format(parseISO('2026-03-12'), 'MMM d, yyyy', { locale: dateLocale }));
  });

  it('falls back to the raw label for invalid time-series dates', () => {
    expect(
      formatDashboardChartTooltipLabel('line', 'not-a-date', resolveDateFnsLocale('en')),
    ).toBe('not-a-date');
  });
});
