import React from 'react';
import { GripVertical, Pencil } from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import {
  DashboardAssigneeOption,
  DashboardStatus,
  DashboardMilestone,
  DashboardOption,
  DashboardWidget,
  DashboardWidgetData,
} from '@/features/dashboard/types/dashboard';
import {
  type DashboardBreakpoint,
  type DashboardViewportProfile,
} from '@/features/dashboard/lib/dashboardResponsive';
import { formatShortDateRange, getPeriodRange } from '@/features/dashboard/lib/dashboardUtils';
import { DashboardChartWidget } from '@/features/dashboard/components/DashboardChartWidget';
import { DashboardMilestoneCalendar } from '@/features/dashboard/components/DashboardMilestoneCalendar';
import { DashboardMilestoneList } from '@/features/dashboard/components/DashboardMilestoneList';
import { DashboardWidgetFilterNote } from '@/features/dashboard/components/DashboardWidgetFilterNote';

interface DashboardWidgetCardProps {
  widget: DashboardWidget;
  data: DashboardWidgetData | null;
  loading: boolean;
  error: string | null;
  editing: boolean;
  milestones?: DashboardMilestone[];
  projects?: DashboardOption[];
  /** Only the colours are read: a person grouped series is painted in their own. */
  assignees?: DashboardAssigneeOption[];
  /** Same, for a status grouped series. */
  statuses?: DashboardStatus[];
  breakpoint?: DashboardBreakpoint;
  viewportProfile?: DashboardViewportProfile;
  touchInteractionMode?: boolean;
  dragHandleArmed?: boolean;
  dragHandlePressing?: boolean;
  onDragHandleTouchStart?: (event: React.TouchEvent<HTMLDivElement>) => void;
  onDragHandleTouchMove?: (event: React.TouchEvent<HTMLDivElement>) => void;
  onDragHandleTouchEnd?: (event: React.TouchEvent<HTMLDivElement>) => void;
  onEdit?: () => void;
}

export const DashboardWidgetCard: React.FC<DashboardWidgetCardProps> = ({
  widget,
  data,
  loading,
  error,
  editing,
  milestones = [],
  projects = [],
  assignees = [],
  statuses = [],
  breakpoint = 'lg',
  viewportProfile = 'desktop',
  touchInteractionMode = false,
  dragHandleArmed = false,
  dragHandlePressing = false,
  onDragHandleTouchStart,
  onDragHandleTouchMove,
  onDragHandleTouchEnd,
  onEdit,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = React.useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const { startDate: taskStartDate, endDate: taskEndDate } = getPeriodRange(widget.period);
  const taskPeriodLabel = formatShortDateRange(taskStartDate, taskEndDate, dateLocale);
  const size = widget.size ?? (widget.type === 'kpi' ? 'small' : 'medium');
  const isPhoneViewport = viewportProfile === 'phone';
  const isTabletViewport = viewportProfile === 'tablet';
  const isMobileViewport = isPhoneViewport || isTabletViewport;
  const isTouchViewport = isMobileViewport || touchInteractionMode;
  const compactByBreakpoint = breakpoint === 'xs' || (breakpoint === 'sm' && size === 'small');
  const compactByViewport = compactByBreakpoint || isPhoneViewport || (isTabletViewport && size === 'small');
  const isKpiSmall = widget.type === 'kpi' && size === 'small';
  const isSmall = size === 'small';
  const showPeriod = size !== 'small' && !compactByViewport;
  const showFilter = size === 'large' && !isPhoneViewport;
  const canShowAxesBySize = size !== 'small' && !isPhoneViewport;
  const isChart = widget.type === 'bar' || widget.type === 'line' || widget.type === 'area' || widget.type === 'pie';
  const milestoneView = widget.milestoneView
    ?? (widget.type === 'milestone_calendar' ? 'calendar' : 'list');
  const milestoneCalendarMode = widget.milestoneCalendarMode ?? 'month';
  const isMilestoneWidget = widget.type === 'milestone' || widget.type === 'milestone_calendar';
  const isMilestoneList = isMilestoneWidget && milestoneView === 'list';
  const isMilestoneCalendar = isMilestoneWidget && milestoneView === 'calendar';
  const contentGapClass = compactByViewport ? 'gap-1' : isSmall ? 'gap-1.5' : 'gap-2';
  const calendarGapClass = isMilestoneCalendar && isSmall ? 'gap-1' : contentGapClass;
  const cardPaddingClass = isKpiSmall
    ? 'p-2'
    : compactByViewport
      ? (isSmall ? 'p-2.5' : 'p-3')
      : isSmall
        ? 'p-3'
        : 'p-4';
  const contentPaddingClass = isKpiSmall
    ? 'pt-0'
    : (isMilestoneCalendar && isSmall) || compactByViewport
      ? 'pt-2'
      : 'pt-3';
  const kpiValueClass = isKpiSmall ? 'text-2xl' : isSmall ? 'text-3xl' : 'text-4xl';
  const kpiValueStyle = isKpiSmall
    ? { fontSize: 'clamp(1.25rem, 6vw, 2.25rem)' }
    : isSmall
      ? { fontSize: 'clamp(1.5rem, 4vw, 2.75rem)' }
      : { fontSize: 'clamp(2rem, 3vw, 3.25rem)' };
  const chartPeriodLabel = (widget.type === 'bar' || widget.type === 'area' || widget.type === 'line')
    ? taskPeriodLabel
    : null;

  return (
    <Card
      className={cn(
        'dashboard-widget-card h-full w-full min-h-0 flex flex-col overflow-hidden',
        cardPaddingClass,
        editing && 'ring-1 ring-muted',
      )}
    >
      {(!isKpiSmall || editing) && (
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              'flex items-start gap-2 transition-colors duration-200',
              editing && 'dashboard-widget-handle cursor-move touch-manipulation select-none',
              editing && dragHandlePressing && 'dashboard-widget-handle-mobile-pressing rounded-sm bg-muted/40 ring-1 ring-primary/20 animate-pulse',
              editing && dragHandleArmed && 'dashboard-widget-handle-mobile-armed rounded-sm bg-muted/60',
            )}
            onTouchStart={editing ? onDragHandleTouchStart : undefined}
            onTouchMove={editing ? onDragHandleTouchMove : undefined}
            onTouchEnd={editing ? onDragHandleTouchEnd : undefined}
            onTouchCancel={editing ? onDragHandleTouchEnd : undefined}
          >
            {editing && <GripVertical className="h-4 w-4 text-muted-foreground" />}
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{widget.title}</span>
              {chartPeriodLabel && <span className="text-xs text-muted-foreground">{chartPeriodLabel}</span>}
            </div>
          </div>
          {editing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-40 transition-opacity hover:opacity-100"
              onClick={onEdit}
              aria-label={`${t`Edit widget`}: ${widget.title}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <div className={cn('flex-1 min-h-0', contentPaddingClass)}>
        {loading && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t`Loading data...`}
          </div>
        )}
        {!loading && error && (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && !error && widget.type === 'kpi' && (
          <div className={cn('flex h-full flex-col items-center justify-center', isKpiSmall ? '' : 'gap-2')}>
            <div
              className={cn(kpiValueClass, 'font-semibold text-foreground text-center')}
              style={kpiValueStyle}
            >
              {data?.total ?? 0}
            </div>
            {!isKpiSmall && showPeriod && (
              <div className="text-xs text-muted-foreground">{taskPeriodLabel}</div>
            )}
            {!isKpiSmall && showFilter && <DashboardWidgetFilterNote statusFilter={widget.statusFilter} />}
          </div>
        )}
        {isChart && (
          <DashboardChartWidget
            widget={widget}
            data={data}
            hidden={loading || Boolean(error)}
            editing={editing}
            size={size}
            viewportProfile={viewportProfile}
            isTouchViewport={isTouchViewport}
            showFilter={showFilter}
            showPeriod={showPeriod}
            canShowAxesBySize={canShowAxesBySize}
            periodLabel={taskPeriodLabel}
            contentGapClass={contentGapClass}
            assignees={assignees}
            projects={projects}
            statuses={statuses}
          />
        )}
        {!loading && !error && isMilestoneList && (
          <DashboardMilestoneList
            milestones={milestones}
            projects={projects}
            period={widget.period}
            size={size}
            showPeriod={showPeriod}
            contentGapClass={contentGapClass}
          />
        )}
        {!loading && !error && isMilestoneCalendar && (
          <DashboardMilestoneCalendar
            milestones={milestones}
            projects={projects}
            calendarMode={milestoneCalendarMode}
            size={size}
            gapClass={calendarGapClass}
          />
        )}
      </div>
    </Card>
  );
};
