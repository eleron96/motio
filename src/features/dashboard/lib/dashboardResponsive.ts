export const DASHBOARD_BREAKPOINTS = {
  xxl: 2560,
  xl: 1600,
  lg: 1200,
  md: 992,
  sm: 768,
  xs: 0,
} as const;

export const DASHBOARD_COLS = {
  xxl: 16,
  xl: 14,
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
  'xxl',
  'xl',
  'lg',
  'md',
  'sm',
  'xs',
];

const BREAKPOINT_PROFILE_MAP: Record<DashboardBreakpoint, DashboardViewportProfile> = {
  xxl: 'wall',
  xl: 'desktop',
  lg: 'desktop',
  md: 'laptop',
  sm: 'tablet',
  xs: 'phone',
};

export const getViewportProfileForBreakpoint = (
  breakpoint: DashboardBreakpoint,
): DashboardViewportProfile => BREAKPOINT_PROFILE_MAP[breakpoint] ?? 'desktop';

type DashboardGridSettings = {
  rowHeight: number;
  margin: [number, number];
  containerPadding: [number, number];
};

export const DASHBOARD_GRID_SETTINGS: Record<DashboardBreakpoint, DashboardGridSettings> = {
  xxl: {
    rowHeight: 68,
    margin: [20, 20],
    containerPadding: [20, 20],
  },
  xl: {
    rowHeight: 70,
    margin: [18, 18],
    containerPadding: [18, 18],
  },
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
