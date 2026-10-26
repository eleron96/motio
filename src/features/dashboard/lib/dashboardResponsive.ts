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
