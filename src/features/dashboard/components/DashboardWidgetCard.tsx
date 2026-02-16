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
import { getBarPalette, getPeriodRange } from '@/features/dashboard/lib/dashboardUtils';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { formatWeekdayLabel, resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';

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
  const isKpiSmall = widget.type === 'kpi' && size === 'small';
  const isSmall = size === 'small';
  const showPeriod = size !== 'small';
  const showFilter = size === 'large';
  const canShowAxesBySize = size !== 'small';
  const palette = widget.type !== 'kpi'
    ? getBarPalette(widget.barPalette)
    : ['#94A3B8'];
  const paletteColors = palette.length ? palette : ['#94A3B8'];
  const isChart = widget.type === 'bar' || widget.type === 'line' || widget.type === 'area' || widget.type === 'pie';
  const chartViewportRef = React.useRef<HTMLDivElement | null>(null);
  const [chartViewport, setChartViewport] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const legendViewportRef = React.useRef<HTMLDivElement | null>(null);
  const [legendViewport, setLegendViewport] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

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
  const contentGapClass = isSmall ? 'gap-1.5' : 'gap-2';
  const calendarGapClass = isMilestoneCalendar && isSmall ? 'gap-1' : contentGapClass;
  const cardPaddingClass = isKpiSmall ? 'p-2' : isSmall ? 'p-3' : 'p-4';
  const contentPaddingClass = isKpiSmall
    ? 'pt-0'
    : isMilestoneCalendar && isSmall
      ? 'pt-2'
      : 'pt-3';
  const [pieTooltipPosition, setPieTooltipPosition] = React.useState<{ x: number; y: number } | undefined>(undefined);
  const pieChartSeries = widget.type === 'pie' ? (data?.series ?? []) : [];
  const pieLegendLimit = size === 'small' ? 2 : size === 'medium' ? 5 : 7;
  const pieSeries = widget.type === 'pie' ? (() => {
    const source = pieChartSeries;
    if (!isSmall) return source;
    if (source.length <= pieLegendLimit) return source;
    const visibleCount = Math.max(1, pieLegendLimit);
    const visible = source.slice(0, visibleCount);
    const hidden = source.slice(visibleCount);
    const otherValue = hidden.reduce((sum, item) => sum + item.value, 0);
    if (!otherValue) return visible;
    return [...visible, { name: PIE_OTHER_KEY, value: otherValue }];
  })() : [];
  const legendItems = isChart
    ? (widget.type === 'pie' ? pieSeries : (data?.series ?? []))
    : [];
  const isLegendEnabled = widget.showLegend ?? true;
  const showLegend = isLegendEnabled && isChart && legendItems.length > 0;
  const chartAspectRatio = chartViewport.height > 0
    ? chartViewport.width / chartViewport.height
    : 0;
  const isUltraWideChart = chartViewport.width >= CHART_ULTRAWIDE_MIN_WIDTH_PX
    || chartAspectRatio >= CHART_ULTRAWIDE_MIN_ASPECT;
  const preferSideLegend = showLegend
    && !isSmall
    && chartViewport.width >= CHART_SIDE_LEGEND_MIN_WIDTH_PX
    && chartAspectRatio >= CHART_SIDE_LEGEND_MIN_ASPECT;
  const isCompactChartHeight = chartViewport.height > 0 && chartViewport.height < 210;
  const isCompactChartWidth = chartViewport.width > 0 && chartViewport.width < 380;
  const showAxes = canShowAxesBySize
    && (chartViewport.width === 0 || chartViewport.width >= 280)
    && (chartViewport.height === 0 || chartViewport.height >= 150);
  const kpiValueClass = isKpiSmall ? 'text-2xl' : isSmall ? 'text-3xl' : 'text-4xl';
  const kpiValueStyle = isKpiSmall
    ? { fontSize: 'clamp(1.25rem, 6vw, 2.25rem)' }
    : isSmall
      ? { fontSize: 'clamp(1.5rem, 4vw, 2.75rem)' }
      : { fontSize: 'clamp(2rem, 3vw, 3.25rem)' };
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
  const timeSeries = data?.timeSeries ?? [];
  const seriesKeys = data?.seriesKeys ?? [];
  const hasTimeSeries = timeSeries.length > 0 && seriesKeys.length > 0;
  const chartPeriodLabel = (widget.type === 'bar' || widget.type === 'area' || widget.type === 'line')
    ? taskPeriodLabel
    : null;
  const isPieLegend = widget.type === 'pie';
  const legendTextClass = isPieLegend
    ? (isCompactChartHeight ? 'text-[8px] leading-tight' : 'text-[9px] leading-tight')
    : isCompactChartHeight
      ? 'text-[9px] leading-snug'
      : legendItems.length > 6
        ? 'text-[10px] leading-snug'
        : 'text-[11px] leading-snug';
  const showLegendValue = !isCompactChartWidth || preferSideLegend;

  React.useLayoutEffect(() => {
    if (!showLegend) return;
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
  }, [showLegend, preferSideLegend, widget.type, size, editing]);

  const legendWidthFallback = preferSideLegend
    ? (isUltraWideChart ? 320 : 270)
    : (chartViewport.width > 0 ? chartViewport.width : (isSmall ? 220 : 360));
  const legendWidth = legendViewport.width > 0 ? legendViewport.width : legendWidthFallback;
  const legendItemMinWidth = preferSideLegend
    ? legendWidth
    : isPieLegend
      ? (showLegendValue ? 132 : 108)
      : (showLegendValue ? 156 : 128);
  const legendGapPx = isPieLegend ? 8 : 10;
  const legendCalculatedColumns = preferSideLegend
    ? 1
    : Math.max(1, Math.floor((legendWidth + legendGapPx) / (legendItemMinWidth + legendGapPx)));
  const legendColumns = Math.max(1, Math.min(legendItems.length || 1, legendCalculatedColumns));
  const legendPanelClass = isUltraWideChart
    ? 'w-[min(36%,320px)]'
    : 'w-[min(40%,270px)]';
  const chartCanvasMinHeight = isSmall
    ? 56
    : preferSideLegend
      ? (isCompactChartHeight ? 92 : 124)
      : (isCompactChartHeight ? 84 : 112);
  const pieCanvasMinHeight = isSmall
    ? 64
    : preferSideLegend
      ? (isCompactChartHeight ? 112 : 156)
      : (isCompactChartHeight ? 96 : 132);
  const fallbackBarMaxSize = size === 'small' ? 16 : size === 'medium' ? 24 : 32;
  const dynamicBarMaxSize = (() => {
    const points = data?.series.length ?? 0;
    if (points === 0 || chartViewport.width <= 0) return fallbackBarMaxSize;
    const widthPerPoint = chartViewport.width / points;
    const widthBased = Math.floor(widthPerPoint * (preferSideLegend ? 0.55 : 0.65));
    const cap = isUltraWideChart ? 44 : 36;
    return Math.max(10, Math.min(cap, widthBased));
  })();
  const legendList = showLegend ? (
    <div className="min-w-0">
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
          const isPieOther = isPieLegend && item.name === PIE_OTHER_KEY;
          return (
            <div
              key={`${item.name}-${index}`}
              className={cn('flex min-w-0 items-center', showLegendValue ? 'gap-1.5' : 'gap-1')}
            >
              <span
                className={cn('rounded-full', isPieLegend ? 'h-1.5 w-1.5' : 'h-2 w-2')}
                style={{
                  backgroundColor: (
                    isPieOther
                      ? '#94A3B8'
                      : paletteColors[index % paletteColors.length]
                  ),
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
      </div>
    </div>
  ) : null;

  const projectNameById = new Map(
    projects.map((project) => [project.id, formatProjectLabel(project.name, project.code)]),
  );
  const projectColorById = new Map(
    projects.map((project) => [project.id, project.color ?? '#94A3B8']),
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
          <div className={cn('flex items-start gap-2', editing && 'dashboard-widget-handle cursor-move')}>
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
          <div className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
            <div
              ref={chartViewportRef}
              className={cn('flex min-h-0 flex-1', preferSideLegend ? 'flex-row gap-3' : 'flex-col gap-2')}
            >
              {data?.series.length ? (
                <ChartContainer
                  config={{ value: { label: t`Tasks` } }}
                  className="flex-1 min-h-0"
                  style={{ aspectRatio: 'auto', minHeight: chartCanvasMinHeight }}
                >
                  <BarChart
                    data={data.series}
                    barGap={4}
                    barCategoryGap={isUltraWideChart ? '28%' : '22%'}
                    maxBarSize={dynamicBarMaxSize}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="#E5E7EB" />
                    {showAxes && (
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                    )}
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {data.series.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={paletteColors[index % paletteColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  {t`No data`}
                </div>
              )}
              {legendList && preferSideLegend && (
                <div ref={legendViewportRef} className={cn(legendPanelClass, 'min-h-0 overflow-y-auto pr-1')}>
                  {legendList}
                </div>
              )}
            </div>
            {legendList && !preferSideLegend && (
              <div ref={legendViewportRef} className="min-w-0 overflow-y-auto pr-1">{legendList}</div>
            )}
            {showFilter && (
              <div className="text-xs text-muted-foreground">
                {t`Filter: ${filterLabels[widget.statusFilter]}`}
              </div>
            )}
          </div>
        )}
        {!loading && !error && widget.type === 'line' && (
          <div className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
            <div
              ref={chartViewportRef}
              className={cn('flex min-h-0 flex-1', preferSideLegend ? 'flex-row gap-3' : 'flex-col gap-2')}
            >
              {hasTimeSeries ? (
                <ChartContainer
                  config={{}}
                  className="flex-1 min-h-0"
                  style={{ aspectRatio: 'auto', minHeight: chartCanvasMinHeight }}
                >
                  <LineChart data={timeSeries}>
                    <CartesianGrid vertical={false} stroke="#E5E7EB" />
                    {showAxes && (
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                    )}
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    {seriesKeys.map((seriesKey, index) => (
                      <Line
                        key={seriesKey.key}
                        type="monotone"
                        dataKey={seriesKey.key}
                        name={seriesKey.label}
                        stroke={paletteColors[index % paletteColors.length]}
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
              {legendList && preferSideLegend && (
                <div ref={legendViewportRef} className={cn(legendPanelClass, 'min-h-0 overflow-y-auto pr-1')}>
                  {legendList}
                </div>
              )}
            </div>
            {legendList && !preferSideLegend && (
              <div ref={legendViewportRef} className="min-w-0 overflow-y-auto pr-1">{legendList}</div>
            )}
            {showFilter && (
              <div className="text-xs text-muted-foreground">
                {t`Filter: ${filterLabels[widget.statusFilter]}`}
              </div>
            )}
          </div>
        )}
        {!loading && !error && widget.type === 'area' && (
          <div className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
            <div
              ref={chartViewportRef}
              className={cn('flex min-h-0 flex-1', preferSideLegend ? 'flex-row gap-3' : 'flex-col gap-2')}
            >
              {hasTimeSeries ? (
                <ChartContainer
                  config={{}}
                  className="flex-1 min-h-0"
                  style={{ aspectRatio: 'auto', minHeight: chartCanvasMinHeight }}
                >
                  <AreaChart data={timeSeries}>
                    <CartesianGrid vertical={false} stroke="#E5E7EB" />
                    {showAxes && (
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                    )}
                    <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                    {seriesKeys.map((seriesKey, index) => (
                      <Area
                        key={seriesKey.key}
                        type="monotone"
                        dataKey={seriesKey.key}
                        name={seriesKey.label}
                        stroke={paletteColors[index % paletteColors.length]}
                        fill={paletteColors[index % paletteColors.length]}
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
              {legendList && preferSideLegend && (
                <div ref={legendViewportRef} className={cn(legendPanelClass, 'min-h-0 overflow-y-auto pr-1')}>
                  {legendList}
                </div>
              )}
            </div>
            {legendList && !preferSideLegend && (
              <div ref={legendViewportRef} className="min-w-0 overflow-y-auto pr-1">{legendList}</div>
            )}
            {showFilter && (
              <div className="text-xs text-muted-foreground">
                {t`Filter: ${filterLabels[widget.statusFilter]}`}
              </div>
            )}
          </div>
        )}
        {!loading && !error && widget.type === 'pie' && (
          <div className={cn('flex h-full min-h-0 flex-col', contentGapClass)}>
            <div
              ref={chartViewportRef}
              className={cn('flex min-h-0 flex-1', preferSideLegend ? 'flex-row gap-3' : 'flex-col gap-2')}
            >
              {pieChartSeries.length ? (
                <ChartContainer
                  config={{ value: { label: t`Tasks` } }}
                  className="flex-1 min-h-0"
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
                      data={pieChartSeries}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={pieInnerRadius}
                      outerRadius={pieOuterRadius}
                      paddingAngle={2}
                    >
                      {pieChartSeries.map((entry, index) => (
                        <Cell
                          key={`${entry.name}-${index}`}
                          fill={paletteColors[index % paletteColors.length]}
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
              {legendList && preferSideLegend && (
                <div ref={legendViewportRef} className={cn(legendPanelClass, 'min-h-0 overflow-y-auto pr-1')}>
                  {legendList}
                </div>
              )}
            </div>
            {legendList && !preferSideLegend && (
              <div ref={legendViewportRef} className="min-w-0 overflow-y-auto pr-1">{legendList}</div>
            )}
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
                    (milestone) => projectColorById.get(milestone.projectId) ?? '#94A3B8',
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
                            const projectColor = projectColorById.get(milestone.projectId) ?? '#94A3B8';
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
