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
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/shared/ui/chart';
import { CHART_GRID_STROKE_COLOR } from '@/shared/lib/colors';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import {
  formatDashboardChartTooltipLabel,
  getDashboardChartLabelDataKey,
} from '@/features/dashboard/lib/dashboardChartLabels';
import type { DashboardViewportProfile } from '@/features/dashboard/lib/dashboardResponsive';
import { useChartLayout } from '@/features/dashboard/hooks/useChartLayout';
import { useSeriesColors } from '@/features/dashboard/hooks/useSeriesColors';
import { DashboardChartLegend } from '@/features/dashboard/components/DashboardChartLegend';
import { DashboardWidgetFilterNote } from '@/features/dashboard/components/DashboardWidgetFilterNote';
import type {
  DashboardAssigneeOption,
  DashboardOption,
  DashboardStatus,
  DashboardWidget,
  DashboardWidgetData,
  DashboardWidgetSize,
} from '@/features/dashboard/types/dashboard';

const PIE_OTHER_KEY = '__pie_other__';
const LEGACY_OTHER_LABEL_IDS = new Set(['/IX/7x', 'RuXuwk']);

interface DashboardChartWidgetProps {
  widget: DashboardWidget;
  data: DashboardWidgetData | null;
  /**
   * Stats are loading or failed to load: draw nothing, but stay mounted so the
   * measured sizes carry over to the next draw.
   */
  hidden: boolean;
  editing: boolean;
  size: DashboardWidgetSize;
  viewportProfile: DashboardViewportProfile;
  isTouchViewport: boolean;
  showFilter: boolean;
  showPeriod: boolean;
  canShowAxesBySize: boolean;
  /** The task period, printed under a pie. */
  periodLabel: string;
  contentGapClass: string;
  assignees: DashboardAssigneeOption[];
  projects: DashboardOption[];
  statuses: DashboardStatus[];
}

/** The body of a bar, line, area or pie widget: the chart and its legend. */
export const DashboardChartWidget: React.FC<DashboardChartWidgetProps> = ({
  widget,
  data,
  hidden,
  editing,
  size,
  viewportProfile,
  isTouchViewport,
  showFilter,
  showPeriod,
  canShowAxesBySize,
  periodLabel,
  contentGapClass,
  assignees,
  projects,
  statuses,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const otherLegendLabel = t`Other`;
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
  const {
    chartShellRef,
    chartViewportRef,
    legendViewportRef,
    chartSeries,
    timeSeries,
    seriesKeys,
    hasTimeSeries,
    isTimeSeriesChart,
    hasSourceTimeSeries,
    isUltraWideChart,
    showAxes,
    preferSideLegend,
    showLegendResolved,
    legendItems,
    legendColumns,
    legendTextClass,
    showLegendValue,
    isPieLegend,
    groupedLegendHint,
    legendPanelClass,
    bottomLegendMaxHeight,
    chartViewportClassName,
    chartContainerClassName,
    chartCanvasMinHeight,
    pieCanvasMinHeight,
    dynamicBarMaxSize,
    pieInnerRadius,
    pieOuterRadius,
  } = useChartLayout({
    widget,
    data,
    size,
    viewportProfile,
    isTouchViewport,
    editing,
    showFilter,
    showPeriod,
    canShowAxesBySize,
  });
  const [pieTooltipPosition, setPieTooltipPosition] = React.useState<{ x: number; y: number } | undefined>(undefined);
  const getSeriesColor = useSeriesColors({
    widget,
    series: chartSeries,
    seriesKeys,
    colorBySeriesKey: isTimeSeriesChart && hasSourceTimeSeries,
    assignees,
    projects,
    statuses,
  });
  const chartLabelDataKey = getDashboardChartLabelDataKey(widget.type);
  const formatTooltipLabel = React.useCallback((value: string | number | undefined) => (
    formatDashboardChartTooltipLabel(widget.type, value, dateLocale)
  ), [dateLocale, widget.type]);
  const legendList = showLegendResolved && legendItems.length > 0 ? (
    <DashboardChartLegend
      items={legendItems}
      columns={legendColumns}
      textClass={legendTextClass}
      isPie={isPieLegend}
      showValue={showLegendValue}
      getSeriesColor={getSeriesColor}
      formatName={formatLegendName}
      hint={groupedLegendHint}
    />
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

  if (hidden) return null;

  return (
    <>
      {widget.type === 'bar' && (
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
          {showFilter && <DashboardWidgetFilterNote statusFilter={widget.statusFilter} />}
        </div>
      )}
      {widget.type === 'line' && (
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
          {showFilter && <DashboardWidgetFilterNote statusFilter={widget.statusFilter} />}
        </div>
      )}
      {widget.type === 'area' && (
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
          {showFilter && <DashboardWidgetFilterNote statusFilter={widget.statusFilter} />}
        </div>
      )}
      {widget.type === 'pie' && (
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
          {showFilter && <DashboardWidgetFilterNote statusFilter={widget.statusFilter} />}
        </div>
      )}
    </>
  );
};
