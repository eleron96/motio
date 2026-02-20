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

