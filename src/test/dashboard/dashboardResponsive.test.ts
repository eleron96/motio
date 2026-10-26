import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_BREAKPOINTS,
  DASHBOARD_COLS,
  getDashboardGridSettings,
  getViewportProfileForBreakpoint,
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
