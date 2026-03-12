import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { GripVertical, Pencil } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import {
  DashboardStatusFilter,
  DashboardMilestone,
  DashboardOption,
  DashboardWidget,
  DashboardWidgetData,
} from '@/features/dashboard/types/dashboard';
import {
  type DashboardBreakpoint,
  type DashboardViewportProfile,
} from '@/features/dashboard/lib/dashboardResponsive';
import { compactLegendItems, resolveLegendRenderState } from '@/features/dashboard/lib/dashboardLegend';
import {
  formatDashboardChartTooltipLabel,
  getDashboardChartLabelDataKey,
} from '@/features/dashboard/lib/dashboardChartLabels';
import { getBarPalette, getPeriodRange } from '@/features/dashboard/lib/dashboardUtils';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { formatWeekdayLabel, resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { CHART_GRID_STROKE_COLOR, DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';

const filterLabels: Record<DashboardStatusFilter, string> = {
  all: t`All statuses`,
  active: t`Active`,
  final: t`Closed`,
  cancelled: t`Cancelled`,
  custom: t`Custom`,
};
const PIE_OTHER_KEY = '__pie_other__';
const LEGACY_OTHER_LABEL_IDS = new Set(['/IX/7x', 'RuXuwk']);
const MILESTONE_LIST_ROW_GAP_PX = 8;
const MILESTONE_MORE_ROW_RESERVE_PX = 24;
const CHART_ULTRAWIDE_MIN_WIDTH_PX = 1180;
const CHART_ULTRAWIDE_MIN_ASPECT = 2.15;
const CHART_SIDE_LEGEND_MIN_WIDTH_PX = 720;
const CHART_SIDE_LEGEND_MIN_ASPECT = 1.6;

interface DashboardWidgetCardProps {
  widget: DashboardWidget;
  data: DashboardWidgetData | null;
  loading: boolean;
  error: string | null;
  editing: boolean;
  milestones?: DashboardMilestone[];
  projects?: DashboardOption[];
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
  const otherLegendLabel = locale === 'ru' ? 'Остальное' : 'Other';
  const isTechnicalLegendName = React.useCallback((name: string) => (
    !name.trim()
    || /^series_/i.test(name)
    || /^__.+__$/.test(name)
    || LEGACY_OTHER_LABEL_IDS.has(name.trim())
  ), []);
  const formatLegendName = React.useCallback((name: string) => {
    if (name === PIE_OTHER_KEY || isTechnicalLegendName(name)) return otherLegendLabel;
    return name;
  }, [isTechnicalLegendName, otherLegendLabel]);
  const dateLocale = React.useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const { startDate: taskStartDate, endDate: taskEndDate } = getPeriodRange(widget.period);
  const formatShortRange = (startDate: string, endDate: string) => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const startLabel = format(start, 'MMM d', { locale: dateLocale });
    const endLabel = format(end, 'MMM d', { locale: dateLocale });
    return startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
  };
  const taskPeriodLabel = formatShortRange(taskStartDate, taskEndDate);
  const size = widget.size ?? (widget.type === 'kpi' ? 'small' : 'medium');
  const isPhoneViewport = viewportProfile === 'phone';
  const isTabletViewport = viewportProfile === 'tablet';
  const isLaptopViewport = viewportProfile === 'laptop';
  const isDesktopViewport = viewportProfile === 'desktop';
  const isWallViewport = viewportProfile === 'wall';
  const isMobileViewport = isPhoneViewport || isTabletViewport;
  const isTouchViewport = isMobileViewport || touchInteractionMode;
  const compactByBreakpoint = breakpoint === 'xs' || (breakpoint === 'sm' && size === 'small');
  const compactByViewport = compactByBreakpoint || isPhoneViewport || (isTabletViewport && size === 'small');
  const isKpiSmall = widget.type === 'kpi' && size === 'small';
  const isSmall = size === 'small';
  const showPeriod = size !== 'small' && !compactByViewport;
  const showFilter = size === 'large' && !isPhoneViewport;
  const canShowAxesBySize = size !== 'small' && !isPhoneViewport;
  const paletteColors = React.useMemo(() => {
    const nextPalette = widget.type !== 'kpi'
      ? getBarPalette(widget.barPalette)
      : [DEFAULT_NEUTRAL_COLOR];
    return nextPalette.length > 0 ? nextPalette : [DEFAULT_NEUTRAL_COLOR];
  }, [widget.barPalette, widget.type]);
  const isChart = widget.type === 'bar' || widget.type === 'line' || widget.type === 'area' || widget.type === 'pie';
  const chartShellRef = React.useRef<HTMLDivElement | null>(null);
  const [chartShellViewport, setChartShellViewport] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const chartViewportRef = React.useRef<HTMLDivElement | null>(null);
  const [chartViewport, setChartViewport] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const legendViewportRef = React.useRef<HTMLDivElement | null>(null);
  const [legendViewport, setLegendViewport] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    if (!isChart) return;
    const node = chartShellRef.current;
    if (!node) return;

    const syncViewport = () => {
      const next = {
        width: node.clientWidth,
        height: node.clientHeight,
      };
      setChartShellViewport((prev) => (
        prev.width === next.width && prev.height === next.height ? prev : next
      ));
    };

    syncViewport();
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(syncViewport);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isChart, widget.type, size, editing]);

  React.useLayoutEffect(() => {
    if (!isChart) return;
    const node = chartViewportRef.current;
    if (!node) return;

    const syncViewport = () => {
      const next = {
        width: node.clientWidth,
        height: node.clientHeight,
      };
      setChartViewport((prev) => (
        prev.width === next.width && prev.height === next.height ? prev : next
      ));
    };

    syncViewport();
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(syncViewport);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isChart, widget.type, size, editing]);

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
  const [pieTooltipPosition, setPieTooltipPosition] = React.useState<{ x: number; y: number } | undefined>(undefined);
  const sourceSeries = React.useMemo(() => data?.series ?? [], [data?.series]);
  const sourceTimeSeries = React.useMemo(() => data?.timeSeries ?? [], [data?.timeSeries]);
  const sourceSeriesKeys = React.useMemo(() => data?.seriesKeys ?? [], [data?.seriesKeys]);
  const isTimeSeriesChart = widget.type === 'line' || widget.type === 'area';
  const hasSourceTimeSeries = sourceTimeSeries.length > 0 && sourceSeriesKeys.length > 0;
  const rawLegendItemCount = isTimeSeriesChart
    ? (hasSourceTimeSeries ? sourceSeriesKeys.length : sourceSeries.length)
    : sourceSeries.length;
  const isLegendEnabled = widget.showLegend ?? true;
  const showLegend = isLegendEnabled && isChart && rawLegendItemCount > 0;
  const chartAspectRatio = chartViewport.height > 0
    ? chartViewport.width / chartViewport.height
    : 0;
  const isUltraWideChart = chartViewport.width >= CHART_ULTRAWIDE_MIN_WIDTH_PX
    || chartAspectRatio >= CHART_ULTRAWIDE_MIN_ASPECT;
  const forceBottomLegend = isTouchViewport;
  const sideLegendWidthThreshold = isWallViewport
    ? 860
    : isDesktopViewport
      ? 720
      : Number.POSITIVE_INFINITY;
  const sideLegendAspectThreshold = isWallViewport ? 1.85 : 1.65;
  const canUseSideLegend = isDesktopViewport || isWallViewport;
  const preferSideLegend = showLegend
    && !forceBottomLegend
    && canUseSideLegend
    && !isSmall
    && chartViewport.width >= Math.max(CHART_SIDE_LEGEND_MIN_WIDTH_PX, sideLegendWidthThreshold)
    && chartAspectRatio >= Math.max(CHART_SIDE_LEGEND_MIN_ASPECT, sideLegendAspectThreshold);
  const isCompactChartHeight = chartViewport.height > 0 && chartViewport.height < 210;
  const isCompactChartWidth = chartViewport.width > 0 && chartViewport.width < 380;
  const axisMinWidth = isLaptopViewport ? 300 : 280;
  const showAxes = canShowAxesBySize
    && (chartViewport.width === 0 || chartViewport.width >= axisMinWidth)
    && (chartViewport.height === 0 || chartViewport.height >= 150);
  const kpiValueClass = isKpiSmall ? 'text-2xl' : isSmall ? 'text-3xl' : 'text-4xl';
  const kpiValueStyle = isKpiSmall
    ? { fontSize: 'clamp(1.25rem, 6vw, 2.25rem)' }
    : isSmall
      ? { fontSize: 'clamp(1.5rem, 4vw, 2.75rem)' }
      : { fontSize: 'clamp(2rem, 3vw, 3.25rem)' };
  const chartPeriodLabel = (widget.type === 'bar' || widget.type === 'area' || widget.type === 'line')
    ? taskPeriodLabel
    : null;
  const isPieLegend = widget.type === 'pie';
  const legendMetaLines = (showFilter ? 1 : 0) + ((widget.type === 'pie' && showPeriod) ? 1 : 0);
  const legendMetaReservePx = legendMetaLines > 0 ? (legendMetaLines * 18) + ((legendMetaLines - 1) * 4) : 0;
  const plotFloorMinHeight = widget.type === 'pie'
    ? (isSmall ? (isPhoneViewport ? 60 : 68) : (isPhoneViewport ? 82 : 94))
    : (isSmall ? (isPhoneViewport ? 52 : 58) : (isPhoneViewport ? 68 : 82));
  const legendBudgetHeight = Math.max(0, Math.floor(
    preferSideLegend
      ? ((chartViewport.height > 0 ? chartViewport.height : chartShellViewport.height) - 6)
      : (chartShellViewport.height - plotFloorMinHeight - legendMetaReservePx - 8),
  ));
  const legendIsDense = rawLegendItemCount > (isTabletViewport ? 6 : 8);
  const legendValueThreshold = isTabletViewport ? 10 : 12;
  const showLegendValue = (preferSideLegend || (
    !isTouchViewport
    && !isCompactChartWidth
    && !isPhoneViewport
    && !(isTabletViewport && legendIsDense)
  )) && rawLegendItemCount <= legendValueThreshold;
  const legendWidthFallback = preferSideLegend
    ? (isUltraWideChart ? 320 : 270)
    : (chartViewport.width > 0 ? chartViewport.width : (isSmall ? 220 : 360));
  const legendWidth = legendViewport.width > 0 ? legendViewport.width : legendWidthFallback;
  const legendItemMinWidth = preferSideLegend
    ? legendWidth
    : isPieLegend
      ? (showLegendValue ? 116 : 92)
      : (showLegendValue ? (isTabletViewport ? 126 : 134) : 104);
  const legendGapPx = isPieLegend ? 6 : (isTabletViewport ? 6 : 8);
  const legendCalculatedColumns = preferSideLegend
    ? 1
    : Math.max(1, Math.floor((legendWidth + legendGapPx) / (legendItemMinWidth + legendGapPx)));
  const legendMaxColumns = isPhoneViewport ? 2 : (isTabletViewport || isTouchViewport) ? 3 : 6;
  const legendColumnsBase = Math.max(1, Math.min(legendCalculatedColumns, legendMaxColumns));
  const legendRowHeightPx = isPieLegend ? (isCompactChartHeight ? 13 : 15) : (isCompactChartHeight ? 14 : 16);
  const legendMaxRows = Math.max(1, Math.floor((legendBudgetHeight + legendGapPx) / (legendRowHeightPx + legendGapPx)));
  const legendCapacity = legendColumnsBase * legendMaxRows;
  const legendRenderState = resolveLegendRenderState({
    isChart,
    legendEnabled: isLegendEnabled,
    rawLegendItemCount,
    legendCapacity,
  });
  const showLegendResolved = legendRenderState.shouldRenderLegend;
  const effectiveLegendCapacity = legendRenderState.effectiveLegendCapacity;
  const legendMinVisibleItems = preferSideLegend
    ? 10
    : isPhoneViewport
      ? 4
      : (isTabletViewport || isTouchViewport)
        ? 6
        : 8;
  const chartSeries = sourceSeries;
  const timeSeries = sourceTimeSeries as Array<{ date: string; [key: string]: number | string }>;
  const seriesKeys = sourceSeriesKeys;
  const hasTimeSeries = timeSeries.length > 0 && seriesKeys.length > 0;
  const baseLegendItems = React.useMemo<Array<{ name: string; value: number }>>(() => {
    if (!isTimeSeriesChart || !hasSourceTimeSeries) {
      return sourceSeries;
    }

    if (sourceSeries.length > 0) {
      return sourceSeries;
    }

    return sourceSeriesKeys
      .map((seriesKey) => ({
        name: seriesKey.label,
        value: timeSeries.reduce((sum, point) => sum + Number(point[seriesKey.key] ?? 0), 0),
      }))
      .sort((left, right) => right.value - left.value);
  }, [hasSourceTimeSeries, isTimeSeriesChart, sourceSeries, sourceSeriesKeys, timeSeries]);
  const resolvedLegendData = React.useMemo<{
    legendItems: Array<{ name: string; value: number }>;
    hiddenCount: number;
  }>(() => {
    if (!showLegendResolved) {
      return { legendItems: [], hiddenCount: 0 };
    }

    return compactLegendItems({
      items: baseLegendItems,
      effectiveLegendCapacity,
      canAggregateOverflow: legendRenderState.canAggregateOverflow,
      minVisibleItems: legendMinVisibleItems,
    });
  }, [
    baseLegendItems,
    effectiveLegendCapacity,
    legendRenderState.canAggregateOverflow,
    legendMinVisibleItems,
    showLegendResolved,
  ]);
  const legendItems = resolvedLegendData.legendItems;
  const groupedLegendCount = resolvedLegendData.hiddenCount;
  const pieInnerRadius = isCompactChartHeight
    ? '42%'
    : size === 'small'
      ? '45%'
      : isUltraWideChart
        ? '58%'
        : '55%';
  const pieOuterRadius = isCompactChartHeight
    ? '72%'
    : size === 'small'
      ? '75%'
      : isUltraWideChart
        ? '92%'
        : '90%';
  const legendTextClass = isPieLegend
    ? (isCompactChartHeight ? 'text-[8px] leading-tight' : 'text-[9px] leading-tight')
    : isCompactChartHeight
      ? 'text-[9px] leading-snug'
      : legendItems.length > 6
        ? 'text-[10px] leading-snug'
        : 'text-[11px] leading-snug';

  React.useLayoutEffect(() => {
    if (!showLegendResolved) return;
    const node = legendViewportRef.current;
    if (!node) return;

    const syncViewport = () => {
      const next = {
        width: node.clientWidth,
        height: node.clientHeight,
      };
      setLegendViewport((prev) => (
        prev.width === next.width && prev.height === next.height ? prev : next
      ));
    };

    syncViewport();
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(syncViewport);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [showLegendResolved, preferSideLegend, widget.type, size, editing]);

  const legendColumns = Math.max(
    1,
    Math.min(legendItems.length || 1, legendColumnsBase),
  );
  const bottomLegendMaxHeightBase = isPhoneViewport ? 84 : (isTabletViewport || isTouchViewport) ? 128 : 176;
  const legendRowsNeeded = Math.max(1, Math.ceil((legendItems.length || 1) / legendColumns));
  const legendRowsNeededHeight = (
    (legendRowsNeeded * legendRowHeightPx)
    + (Math.max(0, legendRowsNeeded - 1) * legendGapPx)
    + 8
  );
  const bottomLegendMaxHeight = Math.max(
    isPhoneViewport ? 36 : 44,
    Math.min(
      isPhoneViewport ? 132 : (isTabletViewport || isTouchViewport) ? 188 : 244,
      Math.max(bottomLegendMaxHeightBase, legendBudgetHeight, legendRowsNeededHeight),
    ),
  );
  const legendPanelClass = isWallViewport
    ? 'w-[min(34%,360px)]'
    : isUltraWideChart
      ? 'w-[min(36%,320px)]'
      : 'w-[min(40%,270px)]';
  const chartViewportClassName = cn(
    'flex min-h-0 flex-1 overflow-hidden',
    preferSideLegend ? 'flex-row gap-3' : 'flex-col gap-2',
  );
  const chartContainerClassName = cn(
    'relative z-0 flex-1 min-h-0 overflow-hidden',
    '[&_.recharts-wrapper]:overflow-hidden',
    '[&_.recharts-surface]:overflow-hidden',
  );
  const chartCanvasMinHeight = isSmall
    ? (isPhoneViewport ? 60 : isTouchViewport ? 62 : 66)
    : preferSideLegend
      ? (isCompactChartHeight ? 78 : (isWallViewport ? 132 : 124))
      : (isCompactChartHeight ? (isPhoneViewport ? 72 : isTouchViewport ? 76 : 82) : (isPhoneViewport ? 104 : isTouchViewport ? 110 : 116));
  const pieCanvasMinHeight = isSmall
    ? (isPhoneViewport ? 64 : isTouchViewport ? 68 : 72)
    : preferSideLegend
      ? (isCompactChartHeight ? 88 : (isWallViewport ? 168 : 156))
      : (isCompactChartHeight ? (isPhoneViewport ? 80 : isTouchViewport ? 86 : 92) : (isPhoneViewport ? 124 : isTouchViewport ? 132 : 140));
  const fallbackBarMaxSize = size === 'small' ? 16 : size === 'medium' ? 24 : 32;
  const dynamicBarMaxSize = (() => {
    const points = chartSeries.length;
    if (points === 0 || chartViewport.width <= 0) return fallbackBarMaxSize;
    const widthPerPoint = chartViewport.width / points;
    const widthBased = Math.floor(widthPerPoint * (preferSideLegend ? 0.55 : 0.65));
    const cap = isUltraWideChart ? 44 : 36;
    return Math.max(10, Math.min(cap, widthBased));
  })();
  const groupedLegendHint = groupedLegendCount > 0
    ? (locale === 'ru'
      ? `+${groupedLegendCount} скрыто`
      : `+${groupedLegendCount} hidden`)
    : null;
  const colorIndexBySeries = React.useMemo(() => {
    const map = new Map<string, number>();
    if (isTimeSeriesChart && hasSourceTimeSeries) {
      sourceSeriesKeys.forEach((seriesKey, index) => {
        map.set(seriesKey.key, index);
        map.set(seriesKey.label, index);
      });
      return map;
    }

    sourceSeries.forEach((item, index) => {
      if (!map.has(item.name)) {
        map.set(item.name, index);
      }
    });
    return map;
  }, [hasSourceTimeSeries, isTimeSeriesChart, sourceSeries, sourceSeriesKeys]);
  const getSeriesColor = React.useCallback((seriesNameOrKey: string, index: number) => {
    const resolvedIndex = colorIndexBySeries.get(seriesNameOrKey) ?? index;
    return paletteColors[resolvedIndex % paletteColors.length];
  }, [colorIndexBySeries, paletteColors]);
  const chartLabelDataKey = getDashboardChartLabelDataKey(widget.type);
  const formatTooltipLabel = React.useCallback((value: string | number | undefined) => (
    formatDashboardChartTooltipLabel(widget.type, value, dateLocale)
  ), [dateLocale, widget.type]);
  const legendList = showLegendResolved && legendItems.length > 0 ? (
    <div className="min-w-0 overflow-hidden">
      <div
        className={cn(
          'grid w-full max-w-full text-muted-foreground',
          isPieLegend ? 'gap-x-2 gap-y-1' : 'gap-x-2.5 gap-y-1',
          legendTextClass,
        )}
        style={{
          gridTemplateColumns: `repeat(${legendColumns}, minmax(0, 1fr))`,
        }}
      >
        {legendItems.map((item, index) => {
          const legendName = formatLegendName(item.name);
          return (
            <div
              key={`${item.name}-${index}`}
              className={cn('flex min-w-0 items-center', showLegendValue ? 'gap-1.5' : 'gap-1')}
            >
              <span
                className={cn('rounded-full', isPieLegend ? 'h-1.5 w-1.5' : 'h-2 w-2')}
                style={{
                  backgroundColor: getSeriesColor(item.name, index),
                }}
              />
              <span className="min-w-0 truncate text-muted-foreground">
                {legendName}
              </span>
              {showLegendValue && (
                <span className="shrink-0 font-medium tabular-nums text-foreground">
                  {item.value.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')}
                </span>
              )}
            </div>
          );
        })}
        {groupedLegendHint && (
          <div className="col-span-full text-[10px] leading-snug text-muted-foreground">
            {groupedLegendHint}
          </div>
        )}
      </div>
    </div>
  ) : null;
  const sideLegendNode = legendList && preferSideLegend ? (
    <div ref={legendViewportRef} className={cn(legendPanelClass, 'relative z-20 min-h-0 overflow-hidden bg-card pr-1')}>
      {legendList}
    </div>
  ) : null;
  const bottomLegendNode = legendList && !preferSideLegend ? (
    <div
      ref={legendViewportRef}
      className="relative z-20 shrink-0 min-w-0 overflow-hidden bg-card pr-1 border-t border-border/50 pt-1"
      style={{ maxHeight: bottomLegendMaxHeight }}
    >
      {legendList}
    </div>
  ) : null;

  const projectNameById = new Map(
    projects.map((project) => [project.id, formatProjectLabel(project.name, project.code)]),
  );
  const projectColorById = new Map(
    projects.map((project) => [project.id, project.color ?? DEFAULT_NEUTRAL_COLOR]),
  );
  const now = new Date();
  const milestoneRangeStart = startOfDay(now);
  const milestoneRangeEnd = endOfDay(
    widget.period === 'day'
      ? now
      : widget.period === 'week'
        ? addWeeks(now, 1)
        : addMonths(now, 1),
  );
  const milestonePeriodLabel = formatShortRange(
    format(milestoneRangeStart, 'yyyy-MM-dd'),
    format(milestoneRangeEnd, 'yyyy-MM-dd'),
  );
  const periodLabel = isMilestoneList ? milestonePeriodLabel : taskPeriodLabel;
  const milestonesInRange = milestones
    .filter((milestone) => isWithinInterval(parseISO(milestone.date), {
      start: milestoneRangeStart,
      end: milestoneRangeEnd,
    }))
    .sort((a, b) => {
      if (a.date === b.date) return a.title.localeCompare(b.title, locale === 'ru' ? 'ru' : 'en');
      return a.date.localeCompare(b.date);
    });
  const milestoneListViewportRef = React.useRef<HTMLDivElement | null>(null);
  const milestoneMeasureRefs = React.useRef(new Map<string, HTMLDivElement>());
  const fallbackMilestoneLimit = size === 'small' ? 2 : size === 'medium' ? 4 : 6;
  const [dynamicMilestoneLimit, setDynamicMilestoneLimit] = React.useState(fallbackMilestoneLimit);
  const setMilestoneMeasureRef = React.useCallback((milestoneId: string) => (node: HTMLDivElement | null) => {
    if (!node) {
      milestoneMeasureRefs.current.delete(milestoneId);
      return;
    }
    milestoneMeasureRefs.current.set(milestoneId, node);
  }, []);

  React.useEffect(() => {
    const validIds = new Set(milestonesInRange.map((milestone) => milestone.id));
    Array.from(milestoneMeasureRefs.current.keys()).forEach((milestoneId) => {
      if (!validIds.has(milestoneId)) {
        milestoneMeasureRefs.current.delete(milestoneId);
      }
    });
  }, [milestonesInRange]);

  const recalculateMilestoneLimit = React.useCallback(() => {
    if (!isMilestoneList) return;
    const viewport = milestoneListViewportRef.current;
    if (!viewport) return;
    const availableHeight = viewport.clientHeight;
    if (!availableHeight) return;

    const rowHeights = milestonesInRange
      .map((milestone) => milestoneMeasureRefs.current.get(milestone.id)?.offsetHeight ?? 0)
      .filter((height) => height > 0);

    if (rowHeights.length === 0) {
      setDynamicMilestoneLimit(Math.min(fallbackMilestoneLimit, milestonesInRange.length));
      return;
    }

    let usedHeight = 0;
    let visibleCount = 0;
    for (let index = 0; index < rowHeights.length; index += 1) {
      const rowHeight = rowHeights[index];
      const rowGap = index > 0 ? MILESTONE_LIST_ROW_GAP_PX : 0;
      const hasHiddenRowsAfter = index < rowHeights.length - 1;
      const moreIndicatorReserve = hasHiddenRowsAfter
        ? MILESTONE_MORE_ROW_RESERVE_PX + (visibleCount > 0 ? MILESTONE_LIST_ROW_GAP_PX : 0)
        : 0;
      const nextHeight = usedHeight + rowGap + rowHeight;
      if (nextHeight + moreIndicatorReserve > availableHeight) break;
      usedHeight = nextHeight;
      visibleCount += 1;
    }

    const normalizedLimit = Math.min(
      rowHeights.length,
      Math.max(visibleCount, rowHeights.length > 0 ? 1 : 0),
    );
    setDynamicMilestoneLimit(normalizedLimit);
  }, [isMilestoneList, milestonesInRange, fallbackMilestoneLimit]);

  React.useLayoutEffect(() => {
    if (!isMilestoneList) return;
    recalculateMilestoneLimit();
    const viewport = milestoneListViewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(recalculateMilestoneLimit);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [isMilestoneList, recalculateMilestoneLimit, locale]);

  const milestoneLimit = isMilestoneList
    ? Math.min(
      milestonesInRange.length,
      Math.max(1, dynamicMilestoneLimit || fallbackMilestoneLimit),
    )
    : fallbackMilestoneLimit;
  const visibleMilestones = milestonesInRange.slice(0, milestoneLimit);
  const hiddenMilestones = milestonesInRange.slice(milestoneLimit);

  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const calendarStart = milestoneCalendarMode === 'month'
    ? startOfWeek(monthStart, { weekStartsOn: 1 })
    : startOfWeek(now, { weekStartsOn: 1 });
  const calendarEnd = milestoneCalendarMode === 'month'
    ? endOfWeek(monthEnd, { weekStartsOn: 1 })
    : endOfWeek(addWeeks(calendarStart, 4), { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekdayLabelStyle: 'narrow' | 'short' = isSmall ? 'narrow' : 'short';
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => (
    formatWeekdayLabel(addDays(calendarStart, index), locale, { style: weekdayLabelStyle, dateLocale })
  ));
  const calendarLabel = milestoneCalendarMode === 'month'
    ? format(monthStart, 'LLLL yyyy', { locale: dateLocale })
    : `${format(calendarStart, 'MMM d', { locale: dateLocale })} - ${format(calendarEnd, 'MMM d', { locale: dateLocale })}`;
  const milestonesByDate = milestones.reduce((map, milestone) => {
    const list = map.get(milestone.date) ?? [];
    list.push(milestone);
    map.set(milestone.date, list);
    return map;
  }, new Map<string, DashboardMilestone[]>());
  const milestonesInCalendar = milestones.filter((milestone) => (
    isWithinInterval(parseISO(milestone.date), { start: calendarStart, end: calendarEnd })
  ));

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
              <div className="text-xs text-muted-foreground">{periodLabel}</div>
            )}
            {!isKpiSmall && showFilter && (
              <div className="text-xs text-muted-foreground">
                {t`Filter: ${filterLabels[widget.statusFilter]}`}
              </div>
            )}
          </div>
        )}
        {!loading && !error && widget.type === 'bar' && (
          <div ref={chartShellRef} className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
            <div
              ref={chartViewportRef}
              className={chartViewportClassName}
            >
              {chartSeries.length ? (
                <ChartContainer
                  config={{ value: { label: t`Tasks` } }}
                  className={chartContainerClassName}
                  style={{ aspectRatio: 'auto', minHeight: chartCanvasMinHeight }}
                >
                  <BarChart
                    data={chartSeries}
                    barGap={4}
                    barCategoryGap={isUltraWideChart ? '28%' : '22%'}
                    maxBarSize={dynamicBarMaxSize}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE_COLOR} />
                    {chartLabelDataKey && (
                      <XAxis dataKey={chartLabelDataKey} hide />
                    )}
                    {showAxes && (
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                    )}
                    <ChartTooltip
                      content={<ChartTooltipContent indicator="dot" labelFormatter={formatTooltipLabel} />}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {chartSeries.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={getSeriesColor(entry.name, index)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t`No data`}
                </div>
              )}
              {sideLegendNode}
            </div>
            {bottomLegendNode}
            {showFilter && (
              <div className="text-xs text-muted-foreground">
                {t`Filter: ${filterLabels[widget.statusFilter]}`}
              </div>
            )}
          </div>
        )}
        {!loading && !error && widget.type === 'line' && (
          <div ref={chartShellRef} className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
            <div
              ref={chartViewportRef}
              className={chartViewportClassName}
            >
              {hasTimeSeries ? (
                <ChartContainer
                  config={{}}
                  className={chartContainerClassName}
                  style={{ aspectRatio: 'auto', minHeight: chartCanvasMinHeight }}
                >
                  <LineChart data={timeSeries}>
                    <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE_COLOR} />
                    {chartLabelDataKey && (
                      <XAxis dataKey={chartLabelDataKey} hide />
                    )}
                    {showAxes && (
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                    )}
                    <ChartTooltip
                      content={<ChartTooltipContent indicator="dot" labelFormatter={formatTooltipLabel} />}
                    />
                    {seriesKeys.map((seriesKey, index) => (
                      <Line
                        key={seriesKey.key}
                        type={isTouchViewport ? 'linear' : 'monotone'}
                        dataKey={seriesKey.key}
                        name={seriesKey.label}
                        stroke={getSeriesColor(seriesKey.key, index)}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t`No data`}
                </div>
              )}
              {sideLegendNode}
            </div>
            {bottomLegendNode}
            {showFilter && (
              <div className="text-xs text-muted-foreground">
                {t`Filter: ${filterLabels[widget.statusFilter]}`}
              </div>
            )}
          </div>
        )}
        {!loading && !error && widget.type === 'area' && (
          <div ref={chartShellRef} className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
            <div
              ref={chartViewportRef}
              className={chartViewportClassName}
            >
              {hasTimeSeries ? (
                <ChartContainer
                  config={{}}
                  className={chartContainerClassName}
                  style={{ aspectRatio: 'auto', minHeight: chartCanvasMinHeight }}
                >
                  <AreaChart data={timeSeries}>
                    <CartesianGrid vertical={false} stroke={CHART_GRID_STROKE_COLOR} />
                    {chartLabelDataKey && (
                      <XAxis dataKey={chartLabelDataKey} hide />
                    )}
                    {showAxes && (
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                    )}
                    <ChartTooltip
                      content={<ChartTooltipContent indicator="dot" labelFormatter={formatTooltipLabel} />}
                    />
                    {seriesKeys.map((seriesKey, index) => (
                      <Area
                        key={seriesKey.key}
                        type={isTouchViewport ? 'linear' : 'monotone'}
                        dataKey={seriesKey.key}
                        name={seriesKey.label}
                        stroke={getSeriesColor(seriesKey.key, index)}
                        fill={getSeriesColor(seriesKey.key, index)}
                        fillOpacity={0.2}
                      />
                    ))}
                  </AreaChart>
                </ChartContainer>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t`No data`}
                </div>
              )}
              {sideLegendNode}
            </div>
            {bottomLegendNode}
            {showFilter && (
              <div className="text-xs text-muted-foreground">
                {t`Filter: ${filterLabels[widget.statusFilter]}`}
              </div>
            )}
          </div>
        )}
        {!loading && !error && widget.type === 'pie' && (
          <div ref={chartShellRef} className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
            <div
              ref={chartViewportRef}
              className={chartViewportClassName}
            >
              {chartSeries.length ? (
                <ChartContainer
                  config={{ value: { label: t`Tasks` } }}
                  className={chartContainerClassName}
                  style={{ aspectRatio: 'auto', minHeight: pieCanvasMinHeight }}
                >
                  <PieChart
                    onMouseMove={(state: { chartX?: number; chartY?: number }) => {
                      if (typeof state.chartX !== 'number' || typeof state.chartY !== 'number') return;
                      setPieTooltipPosition({ x: state.chartX + 14, y: state.chartY + 14 });
                    }}
                    onMouseLeave={() => setPieTooltipPosition(undefined)}
                  >
                    <ChartTooltip
                      content={<ChartTooltipContent indicator="dot" />}
                      position={pieTooltipPosition}
                      allowEscapeViewBox={{ x: true, y: true }}
                    />
                    <Pie
                      data={chartSeries}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={pieInnerRadius}
                      outerRadius={pieOuterRadius}
                      paddingAngle={2}
                    >
                      {chartSeries.map((entry, index) => (
                        <Cell
                          key={`${entry.name}-${index}`}
                          fill={getSeriesColor(entry.name, index)}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t`No data`}
                </div>
              )}
              {sideLegendNode}
            </div>
            {bottomLegendNode}
            {showPeriod && <div className="text-xs text-muted-foreground">{periodLabel}</div>}
            {showFilter && (
              <div className="text-xs text-muted-foreground">
                {t`Filter: ${filterLabels[widget.statusFilter]}`}
              </div>
            )}
          </div>
        )}
        {!loading && !error && isMilestoneList && (
          <div className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
            {milestonesInRange.length ? (
              <div ref={milestoneListViewportRef} className="relative flex-1 min-h-0 overflow-hidden">
                <div className="space-y-2 text-xs">
                  {visibleMilestones.map((milestone) => {
                    const projectName = projectNameById.get(milestone.projectId);
                    return (
                      <div key={milestone.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 break-words text-sm font-medium text-foreground">
                            {milestone.title}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {projectName ?? t`No project`}
                          </div>
                        </div>
                        <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                          {format(parseISO(milestone.date), 'MMM d', { locale: dateLocale })}
                        </div>
                      </div>
                    );
                  })}
                  {hiddenMilestones.length > 0 && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                          >
                            {t`+${hiddenMilestones.length} more milestones`}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs p-2 text-xs">
                          <div className="grid gap-1">
                            {hiddenMilestones.map((milestone) => (
                              <div key={milestone.id} className="flex items-center justify-between gap-3">
                                <span className="truncate">{milestone.title}</span>
                                <span className="text-muted-foreground">
                                  {format(parseISO(milestone.date), 'MMM d', { locale: dateLocale })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 opacity-0">
                  <div className="space-y-2 text-xs">
                    {milestonesInRange.map((milestone) => {
                      const projectName = projectNameById.get(milestone.projectId);
                      return (
                        <div
                          key={`measure-${milestone.id}`}
                          ref={setMilestoneMeasureRef(milestone.id)}
                          className="flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 break-words text-sm font-medium text-foreground">
                              {milestone.title}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {projectName ?? t`No project`}
                            </div>
                          </div>
                          <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                            {format(parseISO(milestone.date), 'MMM d', { locale: dateLocale })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t`No milestones`}
              </div>
            )}
            {showPeriod && <div className="text-xs text-muted-foreground">{periodLabel}</div>}
          </div>
        )}
        {!loading && !error && isMilestoneCalendar && (
          <TooltipProvider delayDuration={200}>
            <div className={cn('flex h-full min-h-0 flex-col', calendarGapClass)}>
              <div className={cn('flex items-center justify-between text-muted-foreground', isSmall ? 'text-[10px]' : 'text-xs')}>
                <span className={cn('truncate', isSmall && 'max-w-[120px]')}>{calendarLabel}</span>
                {!isSmall && <span>{t`${milestonesInCalendar.length} milestones`}</span>}
              </div>
              <div className={cn('grid grid-cols-7', isSmall ? 'text-[9px]' : 'text-[10px]')}>
                {weekdayLabels.map((label, index) => (
                  <div
                    key={format(addDays(calendarStart, index), 'yyyy-MM-dd')}
                    className="text-muted-foreground"
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div
                className={cn('grid grid-cols-7 flex-1 min-h-0', isSmall ? 'gap-0.5' : 'gap-1')}
                style={{ gridAutoRows: '1fr' }}
              >
                {calendarDays.map((day) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const dayMilestones = milestonesByDate.get(key) ?? [];
                  const dayColors = dayMilestones.map(
                    (milestone) => projectColorById.get(milestone.projectId) ?? DEFAULT_NEUTRAL_COLOR,
                  );
                  const maxDots = isSmall ? 2 : size === 'medium' ? 3 : 4;
                  const visibleColors = dayColors.slice(0, maxDots);
                  const moreCount = dayColors.length - visibleColors.length;
                  const isOutsideMonth = milestoneCalendarMode === 'month' && !isSameMonth(day, monthStart);
                  const dayCell = (
                    <div
                      className={cn(
                        'rounded-md border border-transparent leading-none',
                        isSmall ? 'p-0.5 text-[9px]' : 'p-1 text-[11px]',
                        isOutsideMonth && 'text-muted-foreground/50',
                        isToday(day) && 'border-primary text-primary',
                      )}
                    >
                      <div className={cn(isSmall ? 'text-[9px]' : 'text-[11px]')}>
                        {format(day, 'd')}
                      </div>
                      {dayMilestones.length > 0 && (
                        <div className={cn('flex items-center gap-1', isSmall ? 'mt-0.5' : 'mt-1')}>
                          {visibleColors.map((color, index) => (
                            <span
                              key={`${key}-dot-${index}`}
                              className={cn('rounded-full', isSmall ? 'h-1 w-1' : 'h-1.5 w-1.5')}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                          {moreCount > 0 && (
                            <span className="text-[9px] text-muted-foreground">+{moreCount}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );

                  if (dayMilestones.length === 0) {
                    return React.cloneElement(dayCell, { key });
                  }

                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        {dayCell}
                      </TooltipTrigger>
                        <TooltipContent side="top" align="start" className="max-w-xs p-2 text-xs">
                          <div className="grid gap-1">
                            {dayMilestones.map((milestone) => {
                            const projectName = projectNameById.get(milestone.projectId) ?? t`No project`;
                            const projectColor = projectColorById.get(milestone.projectId) ?? DEFAULT_NEUTRAL_COLOR;
                            return (
                              <div key={milestone.id} className="flex items-start gap-2">
                                <span
                                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: projectColor }}
                                />
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-medium text-foreground">
                                    {milestone.title}
                                  </div>
                                  <div className="truncate text-[10px] text-muted-foreground">
                                    {projectName}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </TooltipProvider>
        )}
      </div>
    </Card>
  );
};
