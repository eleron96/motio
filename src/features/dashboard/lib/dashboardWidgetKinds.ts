import { resolveDashboardIncludeDisabledAssignees } from '@/features/dashboard/lib/dashboardAssigneeOptions';
import type { DashboardWidget } from '@/features/dashboard/types/dashboard';

/** Widgets drawn from task stats (everything but milestones). */
export const isTaskWidget = (widget: DashboardWidget) => (
  widget.type === 'kpi'
  || widget.type === 'bar'
  || widget.type === 'line'
  || widget.type === 'area'
  || widget.type === 'pie'
);

/** Widgets that also need the per-day series of their period. */
export const isTimeSeriesWidget = (widget: DashboardWidget) => (
  widget.type === 'line' || widget.type === 'area'
);

/** Which of the two stats loads (with or without disabled people) a widget reads. */
export const getWidgetStatsVariantKey = (widget: DashboardWidget) => (
  resolveDashboardIncludeDisabledAssignees(widget) ? 'includeDisabled' : 'activeOnly'
);
