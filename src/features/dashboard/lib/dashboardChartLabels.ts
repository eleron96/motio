import { format, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';
import { DashboardWidgetType } from '@/features/dashboard/types/dashboard';

export const getDashboardChartLabelDataKey = (widgetType: DashboardWidgetType) => {
  if (widgetType === 'bar') return 'name';
  if (widgetType === 'line' || widgetType === 'area') return 'date';
  return null;
};

export const formatDashboardChartTooltipLabel = (
  widgetType: DashboardWidgetType,
  label: string | number | null | undefined,
  dateLocale: Locale,
) => {
  if (label === null || label === undefined || label === '') return '';

  const normalizedLabel = String(label);
  if (widgetType !== 'line' && widgetType !== 'area') {
    return normalizedLabel;
  }

  const parsedDate = parseISO(normalizedLabel);
  if (Number.isNaN(parsedDate.getTime())) {
    return normalizedLabel;
  }

  return format(parsedDate, 'MMM d, yyyy', { locale: dateLocale });
};
