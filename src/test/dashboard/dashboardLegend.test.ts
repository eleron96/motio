import { describe, expect, it } from 'vitest';
import { compactLegendItems, resolveLegendRenderState } from '@/features/dashboard/lib/dashboardLegend';

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

describe('compactLegendItems', () => {
  const sampleItems = [
    { name: 'A', value: 10 },
    { name: 'B', value: 9 },
    { name: 'C', value: 8 },
    { name: 'D', value: 7 },
  ];

  it('does not compact when compacting is disabled', () => {
    const result = compactLegendItems({
      items: sampleItems,
      effectiveLegendCapacity: 2,
      canAggregateOverflow: false,
    });

    expect(result.legendItems).toEqual(sampleItems);
    expect(result.hiddenCount).toBe(0);
  });

  it('compacts by truncating legend items only and reports hidden count', () => {
    const result = compactLegendItems({
      items: sampleItems,
      effectiveLegendCapacity: 2,
      canAggregateOverflow: true,
    });

    expect(result.legendItems).toEqual([
      { name: 'A', value: 10 },
      { name: 'B', value: 9 },
    ]);
    expect(result.hiddenCount).toBe(2);
  });

  it('respects minimum visible items override', () => {
    const result = compactLegendItems({
      items: sampleItems,
      effectiveLegendCapacity: 2,
      canAggregateOverflow: true,
      minVisibleItems: 3,
    });

    expect(result.legendItems).toEqual([
      { name: 'A', value: 10 },
      { name: 'B', value: 9 },
      { name: 'C', value: 8 },
    ]);
    expect(result.hiddenCount).toBe(1);
  });

  it('keeps at least one legend item even for invalid capacity', () => {
    const result = compactLegendItems({
      items: sampleItems,
      effectiveLegendCapacity: 0,
      canAggregateOverflow: true,
    });

    expect(result.legendItems).toEqual([{ name: 'A', value: 10 }]);
    expect(result.hiddenCount).toBe(3);
  });
});
