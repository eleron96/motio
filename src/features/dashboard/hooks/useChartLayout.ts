import React from 'react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import {
  compactLegendItems,
  resolveCompactChartHeight,
  resolveLegendRenderState,
} from '@/features/dashboard/lib/dashboardLegend';
import type { DashboardViewportProfile } from '@/features/dashboard/lib/dashboardResponsive';
import type {
  DashboardWidget,
  DashboardWidgetData,
  DashboardWidgetSize,
} from '@/features/dashboard/types/dashboard';

const CHART_ULTRAWIDE_MIN_WIDTH_PX = 1180;
const CHART_ULTRAWIDE_MIN_ASPECT = 2.15;
const CHART_SIDE_LEGEND_MIN_WIDTH_PX = 720;
const CHART_SIDE_LEGEND_MIN_ASPECT = 1.6;

type ObservedSize = { width: number; height: number };
const ZERO_SIZE: ObservedSize = { width: 0, height: 0 };

/**
 * Keeps `setSize` in step with the node behind `ref`: measured at once, then
 * on every resize in the next frame, and only when a number changed. A new
 * `resetKey` re-attaches the observer, as the node behind the ref may be new.
 */
const useSizeObserver = (
  ref: React.RefObject<HTMLDivElement | null>,
  setSize: React.Dispatch<React.SetStateAction<ObservedSize>>,
  enabled: boolean,
  resetKey: string,
) => {
  React.useLayoutEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;

    const syncViewport = () => {
      const next = {
        width: node.clientWidth,
        height: node.clientHeight,
      };
      setSize((prev) => (
        prev.width === next.width && prev.height === next.height ? prev : next
      ));
    };

    syncViewport();
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(syncViewport);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, ref, resetKey, setSize]);
};

interface UseChartLayoutOptions {
  widget: DashboardWidget;
  data: DashboardWidgetData | null;
  size: DashboardWidgetSize;
  viewportProfile: DashboardViewportProfile;
  /** A phone, a tablet or any touch screen: the legend always goes below. */
  isTouchViewport: boolean;
  editing: boolean;
  /** The widget prints its status filter under the chart. */
  showFilter: boolean;
  /** The widget prints its period under the chart (pie only). */
  showPeriod: boolean;
  canShowAxesBySize: boolean;
}

/**
 * Lays a chart widget out from what it measures: the legend beside the plot
 * on a wide desktop chart and below it otherwise, how many legend items fit
 * (the rest fold into "+N hidden"), whether the axes show, the plot's minimum
 * height, the bar width and the pie radii.
 */
export const useChartLayout = ({
  widget,
  data,
  size,
  viewportProfile,
  isTouchViewport,
  editing,
  showFilter,
  showPeriod,
  canShowAxesBySize,
}: UseChartLayoutOptions) => {
  const isPhoneViewport = viewportProfile === 'phone';
  const isTabletViewport = viewportProfile === 'tablet';
  const isLaptopViewport = viewportProfile === 'laptop';
  const isDesktopViewport = viewportProfile === 'desktop';
  const isWallViewport = viewportProfile === 'wall';
  const isSmall = size === 'small';
  const chartShellRef = React.useRef<HTMLDivElement | null>(null);
  const [chartShellViewport, setChartShellViewport] = React.useState<ObservedSize>(ZERO_SIZE);
  const chartViewportRef = React.useRef<HTMLDivElement | null>(null);
  const [chartViewport, setChartViewport] = React.useState<ObservedSize>(ZERO_SIZE);
  const legendViewportRef = React.useRef<HTMLDivElement | null>(null);
  const [legendViewport, setLegendViewport] = React.useState<ObservedSize>(ZERO_SIZE);

  useSizeObserver(chartShellRef, setChartShellViewport, true, `${widget.type}|${size}|${editing}`);

  useSizeObserver(chartViewportRef, setChartViewport, true, `${widget.type}|${size}|${editing}`);

  const sourceSeries = React.useMemo(() => data?.series ?? [], [data?.series]);
  const sourceTimeSeries = React.useMemo(() => data?.timeSeries ?? [], [data?.timeSeries]);
  const sourceSeriesKeys = React.useMemo(() => data?.seriesKeys ?? [], [data?.seriesKeys]);
  const isTimeSeriesChart = widget.type === 'line' || widget.type === 'area';
  const hasSourceTimeSeries = sourceTimeSeries.length > 0 && sourceSeriesKeys.length > 0;
  const rawLegendItemCount = isTimeSeriesChart
    ? (hasSourceTimeSeries ? sourceSeriesKeys.length : sourceSeries.length)
    : sourceSeries.length;
  const isLegendEnabled = widget.showLegend ?? true;
  const showLegend = isLegendEnabled && rawLegendItemCount > 0;
  const chartAspectRatio = chartViewport.height > 0
    ? chartViewport.width / chartViewport.height
    : 0;
  // Side or bottom legend is decided on the whole chart area. The plot alone
  // is shorter while the legend sits below it and taller once the legend moves
  // aside, so deciding on the plot could flip a chart near the threshold back
  // and forth; the area holding both does not change with the choice.
  const sideLegendAspectRatio = chartShellViewport.height > 0
    ? chartShellViewport.width / chartShellViewport.height
    : chartAspectRatio;
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
    && sideLegendAspectRatio >= Math.max(CHART_SIDE_LEGEND_MIN_ASPECT, sideLegendAspectThreshold);
  // Compact or not follows the plot's height with a margin (see
  // resolveCompactChartHeight): the switch itself moves that height.
  const [isCompactChartHeight, setIsCompactChartHeight] = React.useState(false);
  React.useLayoutEffect(() => {
    setIsCompactChartHeight((wasCompact) => resolveCompactChartHeight(wasCompact, chartViewport.height));
  }, [chartViewport.height]);
  const isCompactChartWidth = chartViewport.width > 0 && chartViewport.width < 380;
  const axisMinWidth = isLaptopViewport ? 300 : 280;
  const showAxes = canShowAxesBySize
    && (chartViewport.width === 0 || chartViewport.width >= axisMinWidth)
    && (chartViewport.height === 0 || chartViewport.height >= 150);
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
    isChart: true,
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

  useSizeObserver(
    legendViewportRef,
    setLegendViewport,
    showLegendResolved,
    `${preferSideLegend}|${widget.type}|${size}|${editing}`,
  );

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
    ? t`+${groupedLegendCount} hidden`
    : null;

  return {
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
  };
};
