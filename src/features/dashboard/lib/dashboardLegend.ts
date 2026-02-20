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
}: CompactLegendItemsInput): CompactLegendItemsResult => {
  if (!canAggregateOverflow || items.length <= effectiveLegendCapacity) {
    return {
      legendItems: items,
      hiddenCount: 0,
    };
  }

  const visibleCount = Math.max(1, effectiveLegendCapacity);
  return {
    legendItems: items.slice(0, visibleCount),
    hiddenCount: Math.max(0, items.length - visibleCount),
  };
};
