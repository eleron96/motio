import type { StoreApi } from 'zustand';
import {
  DashboardAssigneeOption,
  DashboardLayouts,
  DashboardPeriod,
  DashboardOption,
  DashboardStatus,
  DashboardSummary,
  DashboardMilestone,
  DashboardSeriesRow,
  DashboardStatsRow,
  DashboardTimeOff,
  DashboardWidget,
} from '@/features/dashboard/types/dashboard';
import type { WorkloadDay } from '@/features/dashboard/lib/workloadHeatmap';

type DashboardStatsState = {
  rows: DashboardStatsRow[];
  rowsBase: DashboardStatsRow[];
  seriesRows: DashboardSeriesRow[];
  seriesRowsBase: DashboardSeriesRow[];
  loading: boolean;
  error: string | null;
  lastLoaded: number | null;
};

type DashboardStatsVariantKey = 'activeOnly' | 'includeDisabled';

export type DashboardStatsVariants = Record<DashboardStatsVariantKey, DashboardStatsState>;

type HeatmapState = {
  days: WorkloadDay[];
  rangeKey: string | null;
  loading: boolean;
  error: string | null;
};

export const EMPTY_HEATMAP: HeatmapState = {
  days: [],
  rangeKey: null,
  loading: false,
  error: null,
};

// Absences inside the heatmap window — they shrink the day's denominator. Loaded
// separately from the heatmap RPC (which stays a dumb per-day task count) so the
// whole workload math keeps living on the client.
type TimeOffState = {
  records: DashboardTimeOff[];
  rangeKey: string | null;
  loading: boolean;
  error: string | null;
};

export const EMPTY_TIME_OFF: TimeOffState = {
  records: [],
  rangeKey: null,
  loading: false,
  error: null,
};

export type DashboardState = {
  dashboards: DashboardSummary[];
  dashboardsWorkspaceId: string | null;
  currentDashboardId: string | null;
  widgets: DashboardWidget[];
  layouts: DashboardLayouts;
  statuses: DashboardStatus[];
  projects: DashboardOption[];
  assignees: DashboardAssigneeOption[];
  groups: DashboardOption[];
  assigneeGroupMap: Record<string, string | null>;
  milestones: DashboardMilestone[];
  heatmap: HeatmapState;
  heatmapAutoCapacity: number | null;
  timeOff: TimeOffState;
  // Each person's share of a full day, 0–100 (heatmap.personCapacity); null =
  // not loaded (the setting is off or nobody asked yet).
  personCapacities: { workspaceId: string; values: Record<string, number> } | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  dirty: boolean;
  statsByPeriod: Record<DashboardPeriod, DashboardStatsVariants>;
  loadDashboards: (workspaceId: string) => Promise<void>;
  setCurrentDashboardId: (id: string | null) => void;
  loadDashboard: (workspaceId: string, dashboardId: string | null) => Promise<void>;
  saveDashboard: (workspaceId: string, dashboardId: string | null) => Promise<void>;
  createDashboard: (workspaceId: string, name: string) => Promise<{ id?: string; error?: string }>;
  deleteDashboard: (id: string) => Promise<{ nextId: string | null; error?: string }>;
  renameDashboard: (id: string, name: string) => Promise<{ error?: string }>;
  resetDashboardState: () => void;
  addWidget: (widget: DashboardWidget) => void;
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => void;
  removeWidget: (id: string) => void;
  setLayouts: (layouts: DashboardLayouts) => void;
  loadFilterOptions: (workspaceId: string) => Promise<void>;
  /**
   * Справочники воркспейса изменились в настройках — перечитать их и цифры.
   * Настройки открываются диалогом поверх дашборда, страница не
   * перемонтируется, поэтому сам он о правке никогда не узнаёт.
   */
  refreshAfterCatalogChange: (workspaceId: string) => Promise<void>;
  loadMilestones: (workspaceId: string) => Promise<void>;
  loadHeatmap: (workspaceId: string, startDate: string, endDate: string) => Promise<void>;
  loadTimeOff: (workspaceId: string, startDate: string, endDate: string) => Promise<void>;
  setHeatmapAutoCapacity: (value: number | null) => void;
  loadPersonCapacities: (workspaceId: string) => Promise<void>;
  // A new dashboard with these widgets (copy, import); becomes the current one.
  createDashboardFrom: (
    workspaceId: string,
    input: { name: string; widgets: DashboardWidget[]; layouts: DashboardLayouts },
  ) => Promise<{ id?: string; name?: string; error?: string }>;
  setPersonCapacity: (workspaceId: string, assigneeId: string, percent: number) => Promise<{ error?: string }>;
  loadStats: (
    workspaceId: string,
    period: DashboardPeriod,
    includeSeries?: boolean,
    includeDisabledAssignees?: boolean,
  ) => Promise<void>;
};

export const STATS_CACHE_TTL_MS = 60_000;

const emptyStatsState: DashboardStatsState = {
  rows: [],
  rowsBase: [],
  seriesRows: [],
  seriesRowsBase: [],
  loading: false,
  error: null,
  lastLoaded: null,
};

const createEmptyStatsVariants = (): DashboardStatsVariants => ({
  activeOnly: { ...emptyStatsState },
  includeDisabled: { ...emptyStatsState },
});

export const createEmptyStatsByPeriod = (): Record<DashboardPeriod, DashboardStatsVariants> => ({
  day: createEmptyStatsVariants(),
  week: createEmptyStatsVariants(),
  month: createEmptyStatsVariants(),
  thisWeek: createEmptyStatsVariants(),
  nextWeek: createEmptyStatsVariants(),
  thisMonth: createEmptyStatsVariants(),
  nextMonth: createEmptyStatsVariants(),
});

export const getStatsVariantKey = (includeDisabledAssignees = false): DashboardStatsVariantKey => (
  includeDisabledAssignees ? 'includeDisabled' : 'activeOnly'
);

export type DashboardSetState = StoreApi<DashboardState>['setState'];
export type DashboardGetState = StoreApi<DashboardState>['getState'];
