import { t } from '@lingui/macro';
import { isCalendarPeriod } from '@/features/dashboard/lib/dashboardUtils';
import type { DashboardPeriod } from '@/features/dashboard/types/dashboard';

/**
 * The periods a widget can have. The calendar ones only where the server allows
 * them (Admin → Settings → Calendar periods in dashboards); a widget that
 * already has one keeps it in the list even after they were turned off.
 */
export const dashboardPeriodOptions = (
  calendarPeriodsOn: boolean,
  current: DashboardPeriod,
): Array<{ value: DashboardPeriod; label: string }> => {
  const rolling: Array<{ value: DashboardPeriod; label: string }> = [
    { value: 'day', label: t`Day` },
    { value: 'week', label: t`Week` },
    { value: 'month', label: t`Month` },
  ];
  if (!calendarPeriodsOn && !isCalendarPeriod(current)) return rolling;
  return [
    ...rolling,
    { value: 'thisWeek', label: t`This calendar week` },
    { value: 'nextWeek', label: t`Next calendar week` },
    { value: 'thisMonth', label: t`This calendar month` },
    { value: 'nextMonth', label: t`Next calendar month` },
  ];
};
