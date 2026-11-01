import { getBreakpointFromWidth } from 'react-grid-layout';
import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_BREAKPOINTS,
  DASHBOARD_COLS,
  DASHBOARD_GRID_SETTINGS,
  getDashboardCanvasMetrics,
  getDashboardGridSettings,
  getViewportProfileForBreakpoint,
  type DashboardBreakpoint,
} from '@/features/dashboard/lib/dashboardResponsive';

describe('dashboardResponsive', () => {
  it('uses one 12-column desktop layout for every wide screen', () => {
    expect(Object.keys(DASHBOARD_BREAKPOINTS)).toEqual(['lg', 'md', 'sm', 'xs']);
    expect(DASHBOARD_COLS.lg).toBe(12);
  });

  it('keeps the tuned desktop metrics up to a ~1280px window', () => {
    expect(getDashboardGridSettings('lg', 1218)).toEqual({ rowHeight: 72, margin: [16, 16], containerPadding: [16, 16] });
  });

  it('grows the row height with the grid width so widgets keep their proportions', () => {
    const wide = getDashboardGridSettings('lg', 1848);
    expect(wide.rowHeight).toBe(108);
    expect(wide.margin[0]).toBeGreaterThan(16);
  });

  it('caps the scale-up on very wide screens', () => {
    expect(getDashboardGridSettings('lg', 5000).rowHeight).toBe(Math.round(72 * 1.6));
  });

  it('leaves narrower breakpoints untouched', () => {
    expect(getDashboardGridSettings('md', 1000).rowHeight).toBe(74);
    expect(getDashboardGridSettings('xs', 400).rowHeight).toBe(84);
  });

  it('switches to the wall profile on very wide grids only', () => {
    expect(getViewportProfileForBreakpoint('lg', 1800)).toBe('desktop');
    expect(getViewportProfileForBreakpoint('lg', 2400)).toBe('wall');
    expect(getViewportProfileForBreakpoint('md', 2400)).toBe('laptop');
  });
});

describe('getDashboardCanvasMetrics', () => {
  // How the page used to settle: measure the width inside the canvas padding,
  // derive the metrics (padding included) from it, repeat.
  const settleByMeasuringInside = (canvasWidth: number) => {
    const states: string[] = [];
    let gridWidth = canvasWidth - 2 * DASHBOARD_GRID_SETTINGS.lg.containerPadding[0];
    for (let round = 0; round < 8; round += 1) {
      const breakpoint = getBreakpointFromWidth(DASHBOARD_BREAKPOINTS, gridWidth) as DashboardBreakpoint;
      const settings = getDashboardGridSettings(breakpoint, gridWidth);
      gridWidth = canvasWidth - 2 * settings.containerPadding[0];
      states.push(`${settings.containerPadding[0]}/${settings.rowHeight}/${settings.margin[0]}`);
    }
    const last = states.slice(-4);
    return new Set(last).size === 1 ? { stable: true as const, state: last[0] } : { stable: false as const, state: null };
  };

  it('shook at some window widths when measured inside the padding', () => {
    expect(settleByMeasuringInside(1497).stable).toBe(false);
    expect(settleByMeasuringInside(1653).stable).toBe(false);
    expect(settleByMeasuringInside(1496).stable).toBe(true);
  });

  it('keeps the old metrics wherever the old way was still, for every width from 900 to 3200px', () => {
    for (let canvasWidth = 900; canvasWidth <= 3200; canvasWidth += 1) {
      const old = settleByMeasuringInside(canvasWidth);
      if (!old.stable) continue;
      const { settings, gridWidth } = getDashboardCanvasMetrics(canvasWidth);
      expect(`${settings.containerPadding[0]}/${settings.rowHeight}/${settings.margin[0]}`, `at ${canvasWidth}px`).toBe(old.state);
      expect(gridWidth).toBe(canvasWidth - 2 * settings.containerPadding[0]);
    }
  });

  it('depends on the outer width alone, so the padding it sets cannot move it', () => {
    for (const canvasWidth of [1229, 1341, 1497, 1498, 1653, 1654, 1809, 1810, 1965, 1966]) {
      const first = getDashboardCanvasMetrics(canvasWidth);
      expect(getDashboardCanvasMetrics(canvasWidth), `at ${canvasWidth}px`).toEqual(first);
      expect(first.gridWidth).toBe(canvasWidth - 2 * first.settings.containerPadding[0]);
    }
  });
});
