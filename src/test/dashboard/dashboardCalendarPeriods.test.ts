import { describe, expect, it, vi } from 'vitest';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

import { getPeriodRange, isDashboardPeriod } from '@/features/dashboard/lib/dashboardUtils';
import { dashboardPeriodOptions } from '@/features/dashboard/lib/dashboardPeriodOptions';
import { normalizeWidget } from '@/features/dashboard/lib/dashboardLayout';

// Monday 9 November 2026, the day of the field report that asked for it.
const MONDAY = new Date(2026, 10, 9, 15, 0);
const SUNDAY = new Date(2026, 10, 15, 23, 0);

describe('calendar periods (dashboards.calendarPeriods)', () => {
  it('keeps the old periods exactly as they were: the days up to today', () => {
    expect(getPeriodRange('week', MONDAY)).toEqual({ startDate: '2026-11-02', endDate: '2026-11-09' });
    expect(getPeriodRange('month', MONDAY)).toEqual({ startDate: '2026-10-09', endDate: '2026-11-09' });
    expect(getPeriodRange('day', MONDAY)).toEqual({ startDate: '2026-11-09', endDate: '2026-11-09' });
  });

  it('takes the calendar week from Monday to Sunday', () => {
    expect(getPeriodRange('thisWeek', MONDAY)).toEqual({ startDate: '2026-11-09', endDate: '2026-11-15' });
    expect(getPeriodRange('thisWeek', SUNDAY)).toEqual({ startDate: '2026-11-09', endDate: '2026-11-15' });
    expect(getPeriodRange('nextWeek', SUNDAY)).toEqual({ startDate: '2026-11-16', endDate: '2026-11-22' });
  });

  it('takes the whole calendar month, across the year end too', () => {
    expect(getPeriodRange('thisMonth', MONDAY)).toEqual({ startDate: '2026-11-01', endDate: '2026-11-30' });
    expect(getPeriodRange('nextMonth', new Date(2026, 11, 31))).toEqual({ startDate: '2027-01-01', endDate: '2027-01-31' });
  });

  it('offers the calendar periods only where the server allows them', () => {
    expect(dashboardPeriodOptions(false, 'week').map((option) => option.value)).toEqual(['day', 'week', 'month']);
    expect(dashboardPeriodOptions(true, 'week').map((option) => option.value))
      .toEqual(['day', 'week', 'month', 'thisWeek', 'nextWeek', 'thisMonth', 'nextMonth']);
    // A widget that already has one keeps it after the setting went off.
    expect(dashboardPeriodOptions(false, 'nextWeek')).toHaveLength(7);
  });

  it('reads a period it does not know as a week', () => {
    expect(isDashboardPeriod('thisMonth')).toBe(true);
    expect(isDashboardPeriod('quarter')).toBe(false);
    expect(normalizeWidget({ type: 'kpi', period: 'quarter' as never }).period).toBe('week');
    expect(normalizeWidget({ type: 'kpi', period: 'nextMonth' }).period).toBe('nextMonth');
  });
});
