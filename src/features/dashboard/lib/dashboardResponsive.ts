import { getBreakpointFromWidth } from 'react-grid-layout';
// Every screen from 1200px up shares ONE 12-column layout: a dashboard arranged
// on a laptop looks the same on a wide monitor, only larger. Separate 14/16-
// column layouts for wide screens used to be stored independently and drifted
// from the one people actually arranged (stale defaults, odd sizes, holes).
// Older saved layouts may still carry `xl`/`xxl` keys; they are ignored and
// dropped on the next save.
export const DASHBOARD_BREAKPOINTS = {
  lg: 1200,
  md: 992,
  sm: 768,
  xs: 0,
} as const;

export const DASHBOARD_COLS = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 2,
} as const;

export type DashboardBreakpoint = keyof typeof DASHBOARD_COLS;

export type DashboardViewportProfile =
  | 'phone'
  | 'tablet'
  | 'laptop'
  | 'desktop'
  | 'wall';

export const DASHBOARD_BREAKPOINT_ORDER: DashboardBreakpoint[] = [
  'lg',
  'md',
  'sm',
  'xs',
];

const BREAKPOINT_PROFILE_MAP: Record<DashboardBreakpoint, DashboardViewportProfile> = {
  lg: 'desktop',
  md: 'laptop',
  sm: 'tablet',
  xs: 'phone',
};

/** Grid width from which the desktop layout reads as a wall display. */
export const DASHBOARD_WALL_MIN_WIDTH = 2200;

export const getViewportProfileForBreakpoint = (
  breakpoint: DashboardBreakpoint,
  gridWidth = 0,
): DashboardViewportProfile => {
  if (breakpoint === 'lg' && gridWidth >= DASHBOARD_WALL_MIN_WIDTH) return 'wall';
  return BREAKPOINT_PROFILE_MAP[breakpoint] ?? 'desktop';
};

type DashboardGridSettings = {
  rowHeight: number;
  margin: [number, number];
  containerPadding: [number, number];
};

export const DASHBOARD_GRID_SETTINGS: Record<DashboardBreakpoint, DashboardGridSettings> = {
  lg: {
    rowHeight: 72,
    margin: [16, 16],
    containerPadding: [16, 16],
  },
  md: {
    rowHeight: 74,
    margin: [14, 14],
    containerPadding: [14, 14],
  },
  sm: {
    rowHeight: 78,
    margin: [12, 12],
    containerPadding: [12, 12],
  },
  xs: {
    rowHeight: 84,
    margin: [8, 8],
    containerPadding: [8, 8],
  },
};

/** Grid width the desktop row height was tuned for (a ~1280px window). */
const DESKTOP_BASE_WIDTH = 1232;
/** Cap on the desktop scale-up: past it cards grow wider, not taller. */
const DESKTOP_MAX_SCALE = 1.6;

/**
 * Grid metrics for the current width. On desktop the row height (and the gaps,
 * a little) grow with the grid width, so a widget keeps its proportions on a
 * wide monitor instead of turning into a long flat strip with squeezed charts.
 * Narrower breakpoints keep their fixed metrics.
 */
export const getDashboardGridSettings = (
  breakpoint: DashboardBreakpoint,
  gridWidth: number,
): DashboardGridSettings => {
  const base = DASHBOARD_GRID_SETTINGS[breakpoint] ?? DASHBOARD_GRID_SETTINGS.lg;
  if (breakpoint !== 'lg' || !Number.isFinite(gridWidth) || gridWidth <= DESKTOP_BASE_WIDTH) {
    return base;
  }
  const scale = Math.min(gridWidth / DESKTOP_BASE_WIDTH, DESKTOP_MAX_SCALE);
  const gap = Math.round(base.margin[0] + (scale - 1) * 8);
  return {
    rowHeight: Math.round(base.rowHeight * scale),
    margin: [gap, gap],
    containerPadding: [gap, gap],
  };
};

export type DashboardCanvasMetrics = {
  settings: DashboardGridSettings;
  /** Width left for the grid inside the canvas padding (react-grid-layout's `width`). */
  gridWidth: number;
};

/**
 * Metrics for a dashboard canvas `canvasWidth` px wide, its padding included.
 *
 * The canvas padding is one of the metrics, and on desktop they grow with the
 * grid width. Measured inside the padding, that width moved by 2px with every
 * 1px change of the padding, the padding was recomputed back, and at some
 * window widths (1497, 1653, 1809px, ~2px each) the padding, gaps and row
 * height flipped between two values every frame — the whole dashboard shook.
 * Here they depend on the outer width alone, which the padding does not move.
 *
 * A few rounds find the metrics whose padding leaves exactly the width they
 * were computed for: the state the measured layout settled on before, so
 * nothing moves where it used to be still. Where no such metrics exist, the
 * last round is kept; it is still a function of the outer width, so it stays.
 */
export const getDashboardCanvasMetrics = (canvasWidth: number): DashboardCanvasMetrics => {
  const outerWidth = Number.isFinite(canvasWidth) ? Math.max(0, canvasWidth) : 0;
  const gridWidthFor = (settings: DashboardGridSettings) => Math.max(0, outerWidth - 2 * settings.containerPadding[0]);
  const settingsFor = (gridWidth: number) => getDashboardGridSettings(
    getBreakpointFromWidth(DASHBOARD_BREAKPOINTS, gridWidth) as DashboardBreakpoint,
    gridWidth,
  );

  let gridWidth = gridWidthFor(DASHBOARD_GRID_SETTINGS.lg);
  let settings = settingsFor(gridWidth);
  for (let round = 0; round < 3; round += 1) {
    const nextGridWidth = gridWidthFor(settings);
    if (nextGridWidth === gridWidth) break;
    gridWidth = nextGridWidth;
    settings = settingsFor(gridWidth);
  }
  return { settings, gridWidth: gridWidthFor(settings) };
};
