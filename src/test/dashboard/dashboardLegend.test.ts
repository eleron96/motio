import { describe, expect, it } from 'vitest';
import { resolveLegendRenderState } from '@/features/dashboard/lib/dashboardLegend';

describe('resolveLegendRenderState', () => {
  it('keeps legend visible when enabled and items exist even with very small capacity', () => {
    const result = resolveLegendRenderState({
      isChart: true,
      legendEnabled: true,
      rawLegendItemCount: 8,
      legendCapacity: 0,
    });

    expect(result.shouldRenderLegend).toBe(true);
    expect(result.effectiveLegendCapacity).toBe(1);
    expect(result.canAggregateOverflow).toBe(false);
  });

  it('hides legend when disabled', () => {
    const result = resolveLegendRenderState({
      isChart: true,
      legendEnabled: false,
      rawLegendItemCount: 8,
      legendCapacity: 10,
    });

    expect(result.shouldRenderLegend).toBe(false);
  });

  it('hides legend when there are no legend items', () => {
    const result = resolveLegendRenderState({
      isChart: true,
      legendEnabled: true,
      rawLegendItemCount: 0,
      legendCapacity: 10,
    });

    expect(result.shouldRenderLegend).toBe(false);
  });

  it('allows overflow aggregation when capacity is at least two', () => {
    const result = resolveLegendRenderState({
      isChart: true,
      legendEnabled: true,
      rawLegendItemCount: 8,
      legendCapacity: 2,
    });

    expect(result.shouldRenderLegend).toBe(true);
    expect(result.effectiveLegendCapacity).toBe(2);
    expect(result.canAggregateOverflow).toBe(true);
  });
});

