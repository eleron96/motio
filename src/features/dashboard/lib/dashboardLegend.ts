export interface LegendRenderStateInput {
  isChart: boolean;
  legendEnabled: boolean;
  rawLegendItemCount: number;
  legendCapacity: number;
}

export interface LegendRenderState {
  shouldRenderLegend: boolean;
  effectiveLegendCapacity: number;
  canAggregateOverflow: boolean;
}

export interface LegendItem {
  name: string;
  value: number;
}

export interface CompactLegendItemsInput {
  items: LegendItem[];
  effectiveLegendCapacity: number;
  canAggregateOverflow: boolean;
  minVisibleItems?: number;
}

export interface CompactLegendItemsResult {
  legendItems: LegendItem[];
  hiddenCount: number;
}

export const resolveLegendRenderState = ({
  isChart,
  legendEnabled,
  rawLegendItemCount,
  legendCapacity,
}: LegendRenderStateInput): LegendRenderState => {
  const shouldRenderLegend = legendEnabled && isChart && rawLegendItemCount > 0;
  const normalizedCapacity = Number.isFinite(legendCapacity)
    ? Math.max(1, Math.floor(legendCapacity))
    : 1;

  return {
    shouldRenderLegend,
    effectiveLegendCapacity: normalizedCapacity,
    canAggregateOverflow: normalizedCapacity >= 2,
  };
};

export const compactLegendItems = ({
  items,
  effectiveLegendCapacity,
  canAggregateOverflow,
  minVisibleItems = 1,
}: CompactLegendItemsInput): CompactLegendItemsResult => {
  const normalizedCapacity = Number.isFinite(effectiveLegendCapacity)
    ? Math.max(1, Math.floor(effectiveLegendCapacity))
    : 1;
  const normalizedMinVisible = Number.isFinite(minVisibleItems)
    ? Math.max(1, Math.floor(minVisibleItems))
    : 1;
  const visibleCount = Math.max(normalizedCapacity, normalizedMinVisible);

  if (!canAggregateOverflow || items.length <= visibleCount) {
    return {
      legendItems: items,
      hiddenCount: 0,
    };
  }

  return {
    legendItems: items.slice(0, visibleCount),
    hiddenCount: Math.max(0, items.length - visibleCount),
  };
};

/** Below this plot height a chart goes compact: shorter legend rows, smaller text. */
export const CHART_COMPACT_ENTER_HEIGHT_PX = 210;
/**
 * Going compact shortens the bottom legend (2px per row, at most ~12 rows fit
 * under its height cap), so the plot grows by up to ~25px the moment it turns
 * compact. Leaving compact therefore needs the plot to clear the entry line by
 * more than that: with one line for both, a plot sitting on it flipped between
 * the two every frame and the whole widget twitched.
 */
export const CHART_COMPACT_EXIT_HEIGHT_PX = 250;

/** Whether the chart is compact now, given whether it was and the plot's height. */
export const resolveCompactChartHeight = (wasCompact: boolean, plotHeight: number): boolean => {
  if (plotHeight <= 0) return wasCompact;
  return wasCompact
    ? plotHeight < CHART_COMPACT_EXIT_HEIGHT_PX
    : plotHeight < CHART_COMPACT_ENTER_HEIGHT_PX;
};
