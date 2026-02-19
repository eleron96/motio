import { create } from 'zustand';
import { supabase } from '@/shared/lib/supabaseClient';
import { getAdminUserId } from '@/shared/lib/adminConfig';
import { getStatusEmoji, splitStatusLabel } from '@/shared/lib/statusLabels';
import {
  DashboardLayouts,
  DashboardLayoutItem,
  DashboardPeriod,
  DashboardOption,
  DashboardStatus,
  DashboardSummary,
  DashboardMilestone,
  DashboardSeriesRow,
  DashboardStatsRow,
  DashboardWidget,
  DashboardWidgetSize,
} from '@/features/dashboard/types/dashboard';
import { createWidgetId, getPeriodRange, DEFAULT_BAR_PALETTE } from '@/features/dashboard/lib/dashboardUtils';
import {
  DASHBOARD_BREAKPOINT_ORDER,
  DASHBOARD_BREAKPOINTS,
  DASHBOARD_COLS,
  type DashboardBreakpoint,
} from '@/features/dashboard/lib/dashboardResponsive';

type DashboardStatsState = {
  rows: DashboardStatsRow[];
  rowsBase: DashboardStatsRow[];
  seriesRows: DashboardSeriesRow[];
  seriesRowsBase: DashboardSeriesRow[];
  loading: boolean;
  error: string | null;
  lastLoaded: number | null;
};

type DashboardState = {
  dashboards: DashboardSummary[];
  dashboardsWorkspaceId: string | null;
  currentDashboardId: string | null;
  widgets: DashboardWidget[];
  layouts: DashboardLayouts;
  statuses: DashboardStatus[];
  projects: DashboardOption[];
  assignees: DashboardOption[];
  groups: DashboardOption[];
  assigneeGroupMap: Record<string, string | null>;
  milestones: DashboardMilestone[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  dirty: boolean;
  statsByPeriod: Record<DashboardPeriod, DashboardStatsState>;
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
  loadMilestones: (workspaceId: string) => Promise<void>;
  loadStats: (workspaceId: string, period: DashboardPeriod, includeSeries?: boolean) => Promise<void>;
};

const SIZE_PRESETS: Record<DashboardWidgetSize, { w: number; h: number }> = {
  small: { w: 3, h: 2 },
  medium: { w: 6, h: 4 },
  large: { w: 12, h: 6 },
};

const KPI_SMALL_PRESET = { w: 1, h: 1 };
const MILESTONE_PRESETS: Record<DashboardWidgetSize, { w: number; h: number }> = {
  small: { w: 2, h: 3 },
  medium: { w: 6, h: 4 },
  large: { w: 12, h: 6 },
};
const STATS_CACHE_TTL_MS = 60_000;

const getDefaultSize = (widget: DashboardWidget) => (widget.type === 'kpi' ? 'small' : 'medium');

const normalizeWidgetSize = (
  type: DashboardWidget['type'],
  size?: DashboardWidgetSize,
): DashboardWidgetSize => (size ?? (type === 'kpi' ? 'small' : 'medium'));

const getPresetForWidget = (type: DashboardWidget['type'], size: DashboardWidgetSize) => {
  if (type === 'kpi' && size === 'small') return KPI_SMALL_PRESET;
  if (type === 'milestone' || type === 'milestone_calendar') return MILESTONE_PRESETS[size];
  return SIZE_PRESETS[size];
};

const getSizeForCols = (size: { w: number; h: number }, cols: number) => ({
  w: Math.min(size.w, cols),
  h: size.h,
});

const isChartWidgetType = (type: DashboardWidget['type']) => (
  type === 'bar' || type === 'line' || type === 'area' || type === 'pie'
);

const getResponsivePresetForWidget = (
  type: DashboardWidget['type'],
  size: DashboardWidgetSize,
  cols: number,
) => {
  const preset = getSizeForCols(getPresetForWidget(type, size), cols);
  if (!isChartWidgetType(type) || cols > DASHBOARD_COLS.sm) return preset;
  if (size !== 'small') return preset;
  return {
    ...preset,
    h: Math.max(preset.h, 3),
  };
};

const getLayoutBoundsForSize = (cols: number, minSize: DashboardWidgetSize) => {
  const min = getSizeForCols(SIZE_PRESETS[minSize], cols);
  const max = getSizeForCols(SIZE_PRESETS.large, cols);
  return {
    minW: min.w,
    minH: min.h,
    maxW: max.w,
    maxH: max.h,
  };
};

const getLayoutBoundsForWidget = (widget: DashboardWidget | null, cols: number) => {
  const type = widget?.type ?? 'kpi';
  const min = getResponsivePresetForWidget(type, 'small', cols);
  const max = getResponsivePresetForWidget(type, 'large', cols);
  return {
    minW: min.w,
    minH: min.h,
    maxW: max.w,
    maxH: max.h,
  };
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getWidgetLayoutSize = (widget: DashboardWidget, cols: number) => {
  const size = normalizeWidgetSize(widget.type, widget.size ?? getDefaultSize(widget));
  const base = getResponsivePresetForWidget(widget.type, size, cols);
  const bounds = getLayoutBoundsForWidget(widget, cols);
  return { ...base, ...bounds };
};

const hasCollision = (item: DashboardLayoutItem, others: DashboardLayoutItem[]) => (
  others.some((other) => (
    item.x < other.x + other.w
    && item.x + item.w > other.x
    && item.y < other.y + other.h
    && item.y + item.h > other.y
  ))
);

const findAvailablePosition = (
  layout: DashboardLayoutItem[],
  size: Pick<DashboardLayoutItem, 'w' | 'h'>,
  cols: number,
) => {
  const maxY = layout.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
  const maxX = Math.max(cols - size.w, 0);
  for (let y = 0; y <= maxY + size.h; y += 1) {
    for (let x = 0; x <= maxX; x += 1) {
      const candidate: DashboardLayoutItem = { i: 'candidate', x, y, w: size.w, h: size.h };
      if (!hasCollision(candidate, layout)) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: maxY };
};

const findAvailablePositionFrom = (
  layout: DashboardLayoutItem[],
  size: Pick<DashboardLayoutItem, 'w' | 'h'>,
  cols: number,
  preferredX: number,
  preferredY: number,
) => {
  const maxY = layout.reduce((acc, item) => Math.max(acc, item.y + item.h), 0);
  const maxX = Math.max(cols - size.w, 0);
  const startY = Math.max(0, preferredY);
  const clampedPreferredX = clampNumber(preferredX, 0, maxX);
  const xOrder = [
    ...Array.from({ length: Math.max(maxX - clampedPreferredX + 1, 0) }, (_, index) => clampedPreferredX + index),
    ...Array.from({ length: Math.max(clampedPreferredX, 0) }, (_, index) => index),
  ];

  for (let y = startY; y <= maxY + size.h; y += 1) {
    for (const x of xOrder) {
      const candidate: DashboardLayoutItem = { i: 'candidate', x, y, w: size.w, h: size.h };
      if (!hasCollision(candidate, layout)) {
        return { x, y };
      }
    }
  }

  for (let y = 0; y < startY; y += 1) {
    for (const x of xOrder) {
      const candidate: DashboardLayoutItem = { i: 'candidate', x, y, w: size.w, h: size.h };
      if (!hasCollision(candidate, layout)) {
        return { x, y };
      }
    }
  }

  return { x: clampedPreferredX, y: Math.max(startY, maxY) };
};

const getClosestWidgetSize = (
  w: number,
  h: number,
  cols: number,
  widgetType?: DashboardWidget['type'],
): DashboardWidgetSize => {
  const type = widgetType ?? 'kpi';
  const candidates = (Object.keys(SIZE_PRESETS) as DashboardWidgetSize[]).map((size) => {
    const preset = getSizeForCols(getPresetForWidget(type, size), cols);
    const distance = Math.abs(preset.w - w) + Math.abs(preset.h - h);
    return { size, distance };
  });
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.size ?? 'small';
};


const buildStackedLayout = (widgets: DashboardWidget[], cols: number) => {
  let y = 0;
  return widgets.map((widget) => {
    const size = getWidgetLayoutSize(widget, cols);
    const item: DashboardLayoutItem = {
      i: widget.id,
      x: 0,
      y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      maxW: size.maxW,
      maxH: size.maxH,
    };
    y += size.h;
    return item;
  });
};

const buildPackedLayout = (widgets: DashboardWidget[], cols: number) => {
  const layout: DashboardLayoutItem[] = [];
  widgets.forEach((widget) => {
    const size = getWidgetLayoutSize(widget, cols);
    const position = findAvailablePosition(layout, size, cols);
    layout.push({
      i: widget.id,
      x: position.x,
      y: position.y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      maxW: size.maxW,
      maxH: size.maxH,
    });
  });
  return layout;
};

const buildDefaultLayouts = (widgets: DashboardWidget[]): DashboardLayouts => {
  return DASHBOARD_BREAKPOINT_ORDER.reduce<DashboardLayouts>((acc, breakpoint) => {
    const cols = DASHBOARD_COLS[breakpoint];
    const layout = cols <= 2
      ? buildStackedLayout(widgets, cols)
      : buildPackedLayout(widgets, cols);
    acc[breakpoint] = layout;
    return acc;
  }, {});
};

const createDefaultWidgets = (): DashboardWidget[] => [];

const normalizeWidget = (widget: Partial<DashboardWidget>): DashboardWidget => {
  const rawType = widget.type ?? 'kpi';
  const type = rawType === 'milestone_calendar' ? 'milestone' : rawType;
  const hasPalette = type === 'bar' || type === 'line' || type === 'area' || type === 'pie';
  const milestoneView = type === 'milestone'
    ? (widget.milestoneView ?? (rawType === 'milestone_calendar' ? 'calendar' : 'list'))
    : undefined;
  const milestoneCalendarMode = type === 'milestone'
    ? (widget.milestoneCalendarMode ?? 'month')
    : undefined;
  const normalized: DashboardWidget = {
    id: widget.id ?? createWidgetId(),
    title: widget.title ?? 'Widget',
    type,
    period: widget.period ?? 'week',
    groupBy: widget.groupBy ?? 'none',
    size: normalizeWidgetSize(type, widget.size),
    barPalette: hasPalette ? (widget.barPalette ?? DEFAULT_BAR_PALETTE) : undefined,
    showLegend: hasPalette ? (widget.showLegend ?? true) : undefined,
    milestoneView,
    milestoneCalendarMode,
    statusFilter: widget.statusFilter ?? 'all',
    statusIds: widget.statusIds ?? [],
    includeUnassigned: widget.includeUnassigned ?? true,
    filterGroups: widget.filterGroups ?? [],
  };
  return normalized;
};

const applyWidgetConstraints = (layouts: DashboardLayouts, widget: DashboardWidget): DashboardLayouts => {
  const nextLayouts: DashboardLayouts = {};
  Object.entries(DASHBOARD_COLS).forEach(([breakpoint, cols]) => {
    const currentLayout = layouts[breakpoint] ?? [];
    const bounds = getLayoutBoundsForWidget(widget, cols);
    nextLayouts[breakpoint] = currentLayout.map((item) => {
      if (item.i !== widget.id) return item;
      const w = clampNumber(Math.round(toFiniteNumber(item.w, bounds.minW)), bounds.minW, bounds.maxW);
      const h = clampNumber(Math.round(toFiniteNumber(item.h, bounds.minH)), bounds.minH, bounds.maxH);
      const x = clampNumber(Math.round(toFiniteNumber(item.x, 0)), 0, Math.max(cols - w, 0));
      return {
        ...item,
        x,
        w,
        h,
        minW: bounds.minW,
        minH: bounds.minH,
        maxW: bounds.maxW,
        maxH: bounds.maxH,
      };
    });
  });
  return nextLayouts;
};

const addWidgetToLayouts = (layouts: DashboardLayouts, widget: DashboardWidget) => {
  const nextLayouts: DashboardLayouts = {};
  Object.entries(DASHBOARD_COLS).forEach(([breakpoint, cols]) => {
    const currentLayout = layouts[breakpoint] ?? [];
    const size = getWidgetLayoutSize(widget, cols);
    const position = findAvailablePosition(currentLayout, size, cols);
    const item: DashboardLayoutItem = {
      i: widget.id,
      x: position.x,
      y: position.y,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
      maxW: size.maxW,
      maxH: size.maxH,
    };
    nextLayouts[breakpoint] = [...currentLayout, item];
  });
  return nextLayouts;
};

const resolveRawLayoutForBreakpoint = (
  layouts: DashboardLayouts,
  breakpoint: DashboardBreakpoint,
  widgetIds: Set<string>,
) => {
  const direct = (layouts[breakpoint] ?? []).filter((item) => widgetIds.has(item.i));
  if (direct.length > 0) return direct;

  const targetIndex = DASHBOARD_BREAKPOINT_ORDER.indexOf(breakpoint);
  if (targetIndex < 0) return [];

  for (let distance = 1; distance < DASHBOARD_BREAKPOINT_ORDER.length; distance += 1) {
    const candidates = [targetIndex - distance, targetIndex + distance]
      .filter((index) => index >= 0 && index < DASHBOARD_BREAKPOINT_ORDER.length);

    for (const index of candidates) {
      const sourceBreakpoint = DASHBOARD_BREAKPOINT_ORDER[index];
      const sourceLayout = (layouts[sourceBreakpoint] ?? []).filter((item) => widgetIds.has(item.i));
      if (sourceLayout.length === 0) continue;

      const sourceCols = DASHBOARD_COLS[sourceBreakpoint];
      const targetCols = DASHBOARD_COLS[breakpoint];
      if (sourceCols === targetCols) return sourceLayout;

      const ratio = targetCols / sourceCols;
      return sourceLayout.map((item) => {
        const rawW = Math.max(1, Math.round(toFiniteNumber(item.w, 1) * ratio));
        const w = clampNumber(rawW, 1, targetCols);
        const rawX = Math.round(toFiniteNumber(item.x, 0) * ratio);
        const x = clampNumber(rawX, 0, Math.max(targetCols - w, 0));
        return { ...item, x, w };
      });
    }
  }

  return [];
};

const normalizeLayouts = (layouts: DashboardLayouts, widgets: DashboardWidget[]) => {
  const widgetIds = new Set(widgets.map((widget) => widget.id));
  const widgetMap = new Map(widgets.map((widget) => [widget.id, widget]));
  const normalized: DashboardLayouts = {};

  DASHBOARD_BREAKPOINT_ORDER.forEach((breakpoint) => {
    const cols = DASHBOARD_COLS[breakpoint];
    const rawLayout = resolveRawLayoutForBreakpoint(layouts, breakpoint, widgetIds);
    const currentLayout: DashboardLayoutItem[] = [];
    rawLayout.forEach((item) => {
      const widget = widgetMap.get(item.i) ?? null;
      const size = widget ? getWidgetLayoutSize(widget, cols) : getLayoutBoundsForSize(cols, 'small');
      const rawW = toFiniteNumber(item.w, size.w);
      const rawH = toFiniteNumber(item.h, size.h);
      const w = clampNumber(Math.round(rawW), 1, cols);
      const h = Math.max(1, Math.round(rawH));
      const rawX = toFiniteNumber(item.x, Number.NaN);
      const rawY = toFiniteNumber(item.y, Number.NaN);
      const shouldAutoPlace = !Number.isFinite(rawX) || !Number.isFinite(rawY);
      let x = Number.isFinite(rawX) ? Math.round(rawX) : 0;
      let y = Number.isFinite(rawY) ? Math.round(rawY) : 0;
      x = clampNumber(x, 0, Math.max(cols - w, 0));
      y = Math.max(0, y);
      let nextItem: DashboardLayoutItem = {
        ...item,
        x,
        y,
        w,
        h,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
      };
      if (shouldAutoPlace || hasCollision(nextItem, currentLayout)) {
        const position = findAvailablePosition(currentLayout, nextItem, cols);
        nextItem = { ...nextItem, x: position.x, y: position.y };
      }
      currentLayout.push(nextItem);
    });
    const existingIds = new Set(currentLayout.map((item) => item.i));
    const missingWidgets = widgets.filter((widget) => !existingIds.has(widget.id));
    const layoutWithAll = missingWidgets.reduce((acc, widget) => {
      const size = getWidgetLayoutSize(widget, cols);
      const position = findAvailablePosition(acc, size, cols);
      const item: DashboardLayoutItem = {
        i: widget.id,
        x: position.x,
        y: position.y,
        w: size.w,
        h: size.h,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
      };
      return [...acc, item];
    }, currentLayout);

    const resolvedLayout = layoutWithAll.reduce<DashboardLayoutItem[]>((acc, item) => {
      const widget = widgetMap.get(item.i) ?? null;
      const size = widget ? getWidgetLayoutSize(widget, cols) : getLayoutBoundsForSize(cols, 'small');
      const w = clampNumber(Math.round(toFiniteNumber(item.w, size.w)), size.minW, Math.min(size.maxW, cols));
      const h = clampNumber(Math.round(toFiniteNumber(item.h, size.h)), size.minH, size.maxH);
      const x = clampNumber(Math.round(toFiniteNumber(item.x, 0)), 0, Math.max(cols - w, 0));
      const y = Math.max(0, Math.round(toFiniteNumber(item.y, 0)));
      let nextItem: DashboardLayoutItem = {
        ...item,
        x,
        y,
        w,
        h,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
      };
      if (hasCollision(nextItem, acc)) {
        const position = findAvailablePositionFrom(acc, nextItem, cols, nextItem.x, nextItem.y);
        nextItem = { ...nextItem, x: position.x, y: position.y };
      }
      return [...acc, nextItem];
    }, []);

    normalized[breakpoint] = resolvedLayout;
  });

  return normalized;
};

const emptyStatsState: DashboardStatsState = {
  rows: [],
  rowsBase: [],
  seriesRows: [],
  seriesRowsBase: [],
  loading: false,
  error: null,
  lastLoaded: null,
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  widgets: [],
  layouts: {},
  statuses: [],
  projects: [],
  assignees: [],
  groups: [],
  assigneeGroupMap: {},
  milestones: [],
  loading: false,
  saving: false,
  error: null,
  dirty: false,
  statsByPeriod: {
    day: { ...emptyStatsState },
    week: { ...emptyStatsState },
    month: { ...emptyStatsState },
  },
  dashboards: [],
  dashboardsWorkspaceId: null,
  currentDashboardId: null,
  loadDashboards: async (workspaceId) => {
    set({ error: null });
    const { data, error } = await supabase
      .from('workspace_dashboards')
      .select('id, name, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });

    if (error) {
      set({ error: error.message, dashboards: [], dashboardsWorkspaceId: workspaceId });
      return;
    }

    const dashboards = (data ?? []).map((row) => ({
      id: row.id as string,
      name: (row.name as string) ?? 'Dashboard',
      createdAt: (row.created_at as string) ?? null,
    }));
    set({ dashboards, dashboardsWorkspaceId: workspaceId });
  },
  setCurrentDashboardId: (id) => set({ currentDashboardId: id }),
  loadDashboard: async (workspaceId, dashboardId) => {
    set({
      loading: true,
      error: null,
      statsByPeriod: {
        day: { ...emptyStatsState },
        week: { ...emptyStatsState },
        month: { ...emptyStatsState },
      },
    });

    if (!dashboardId) {
      const widgets = createDefaultWidgets();
      const layouts = buildDefaultLayouts(widgets);
      set({ widgets, layouts, loading: false, dirty: false, currentDashboardId: null });
      return;
    }

    const { data, error } = await supabase
      .from('workspace_dashboards')
      .select('id, name, layouts, widgets')
      .eq('workspace_id', workspaceId)
      .eq('id', dashboardId)
      .maybeSingle();

    if (error && (error as { code?: string }).code !== 'PGRST116') {
      set({ loading: false, error: error.message });
      return;
    }

    if (!data) {
      const widgets = createDefaultWidgets();
      const layouts = buildDefaultLayouts(widgets);
      set({ widgets, layouts, loading: false, dirty: false });
      return;
    }

    const widgets = Array.isArray(data.widgets)
      ? (data.widgets as Array<Partial<DashboardWidget> | null | undefined>)
        .filter((widget): widget is Partial<DashboardWidget> => Boolean(widget) && typeof widget === 'object')
        .map(normalizeWidget)
      : createDefaultWidgets();
    const layouts = data.layouts && typeof data.layouts === 'object'
      ? (data.layouts as DashboardLayouts)
      : buildDefaultLayouts(widgets);
    set({
      widgets,
      layouts: normalizeLayouts(layouts, widgets),
      loading: false,
      dirty: false,
      currentDashboardId: data.id ?? dashboardId,
    });
  },
  saveDashboard: async (workspaceId, dashboardId) => {
    if (!dashboardId) return;
    const { widgets, layouts } = get();
    set({ saving: true, error: null });
    const { error } = await supabase
      .from('workspace_dashboards')
      .update({ widgets, layouts })
      .eq('workspace_id', workspaceId)
      .eq('id', dashboardId);
    if (error) {
      set({ saving: false, error: error.message });
      return;
    }
    set({ saving: false, dirty: false });
  },
  createDashboard: async (workspaceId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return { error: 'Dashboard name is required.' };
    const { dashboards } = get();
    if (dashboards.length >= 10) return { error: 'Dashboard limit reached (10).' };

    const widgets = createDefaultWidgets();
    const layouts = buildDefaultLayouts(widgets);
    const { data, error } = await supabase
      .from('workspace_dashboards')
      .insert({
        workspace_id: workspaceId,
        name: trimmed,
        widgets,
        layouts,
      })
      .select('id, name, created_at')
      .single();

    if (error || !data) {
      const errCode = (error as { code?: string })?.code;
      if (errCode === '23505') {
        return { error: 'Dashboard name already exists.' };
      }
      return { error: error?.message ?? 'Failed to create dashboard.' };
    }

    const next = {
      id: data.id as string,
      name: (data.name as string) ?? trimmed,
      createdAt: (data.created_at as string) ?? null,
    };
    set((state) => ({
      dashboards: [...state.dashboards, next],
      currentDashboardId: next.id,
    }));
    return { id: next.id };
  },
  deleteDashboard: async (id) => {
    const { error } = await supabase
      .from('workspace_dashboards')
      .delete()
      .eq('id', id);
    if (error) {
      set({ error: error.message });
      return { nextId: get().currentDashboardId };
    }
    const dashboards = get().dashboards.filter((dashboard) => dashboard.id !== id);
    const nextId = dashboards[0]?.id ?? null;
    set((state) => ({
      dashboards,
      currentDashboardId: state.currentDashboardId === id ? nextId : state.currentDashboardId,
    }));
    return { nextId };
  },
  renameDashboard: async (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return { error: 'Dashboard name is required.' };
    const { error } = await supabase
      .from('workspace_dashboards')
      .update({ name: trimmed })
      .eq('id', id);
    if (error) {
      const errCode = (error as { code?: string })?.code;
      if (errCode === '23505') {
        return { error: 'Dashboard name already exists.' };
      }
      return { error: error.message };
    }
    set((state) => ({
      dashboards: state.dashboards.map((dashboard) => (
        dashboard.id === id ? { ...dashboard, name: trimmed } : dashboard
      )),
    }));
    return {};
  },
  resetDashboardState: () => set({
    dashboards: [],
    dashboardsWorkspaceId: null,
    currentDashboardId: null,
    widgets: [],
    layouts: {},
    statuses: [],
    projects: [],
    assignees: [],
    groups: [],
    assigneeGroupMap: {},
    milestones: [],
    loading: false,
    saving: false,
    error: null,
    dirty: false,
    statsByPeriod: {
      day: { ...emptyStatsState },
      week: { ...emptyStatsState },
      month: { ...emptyStatsState },
    },
  }),
  addWidget: (widget) => set((state) => {
    const normalized = normalizeWidget(widget);
    return {
      widgets: [...state.widgets, normalized],
      layouts: addWidgetToLayouts(state.layouts, normalized),
      dirty: true,
    };
  }),
  updateWidget: (id, updates) => set((state) => {
    const current = state.widgets.find((widget) => widget.id === id);
    if (!current) return state;
    const nextType = updates.type ?? current.type;
    const hasSizeUpdate = Object.prototype.hasOwnProperty.call(updates, 'size');
    const nextSize = hasSizeUpdate
      ? normalizeWidgetSize(nextType, updates.size)
      : current.size;
    const nextUpdates = hasSizeUpdate ? { ...updates, size: nextSize } : updates;
    const nextWidgets = state.widgets.map((widget) => (
      widget.id === id ? { ...widget, ...nextUpdates } : widget
    ));
    const typeChanged = Object.prototype.hasOwnProperty.call(updates, 'type') && updates.type !== current.type;
    const nextWidget = { ...current, ...nextUpdates };
    return {
      widgets: nextWidgets,
      layouts: typeChanged ? applyWidgetConstraints(state.layouts, nextWidget) : state.layouts,
      dirty: true,
    };
  }),
  removeWidget: (id) => set((state) => ({
    widgets: state.widgets.filter((widget) => widget.id !== id),
    layouts: Object.fromEntries(
      Object.entries(state.layouts).map(([breakpoint, layout]) => [
        breakpoint,
        layout.filter((item) => item.i !== id),
      ]),
    ),
    dirty: true,
  })),
  setLayouts: (layouts) => set((state) => ({
    layouts: normalizeLayouts(layouts, state.widgets),
    dirty: true,
  })),
  loadFilterOptions: async (workspaceId) => {
    const [statusesRes, projectsRes, assigneesRes, groupsRes, membersRes] = await Promise.all([
      supabase
        .from('statuses')
        .select('id, name, emoji, color, is_final, is_cancelled')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('projects')
        .select('id, name, code, color')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('assignees')
        .select('id, name, user_id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('member_groups')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true }),
      supabase
        .from('workspace_members')
        .select('user_id, group_id')
        .eq('workspace_id', workspaceId),
    ]);

    if (statusesRes.error || projectsRes.error || assigneesRes.error || groupsRes.error || membersRes.error) {
      set({
        error: statusesRes.error?.message
          || projectsRes.error?.message
          || assigneesRes.error?.message
          || groupsRes.error?.message
          || membersRes.error?.message
          || 'Failed to load filter options.',
      });
      return;
    }

    const adminUserId = await getAdminUserId();
    const statuses = (statusesRes.data ?? []).map((row) => {
      const { name: cleanedName, emoji: inlineEmoji } = splitStatusLabel(row.name as string);
      const hasEmojiField = Object.prototype.hasOwnProperty.call(row, 'emoji');
      const explicitEmoji = typeof row.emoji === 'string' ? row.emoji.trim() : row.emoji;
      const resolvedEmoji = hasEmojiField
        ? (explicitEmoji || null)
        : (inlineEmoji ?? getStatusEmoji(cleanedName));
      const isCancelled = Boolean(row.is_cancelled);
      return {
        id: row.id as string,
        name: cleanedName,
        emoji: resolvedEmoji ?? null,
        color: row.color as string,
        isFinal: Boolean(row.is_final) && !isCancelled,
        isCancelled,
      };
    });
    const projects = (projectsRes.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      code: (row as { code?: string | null }).code ?? null,
      color: row.color ?? undefined,
    }));
    const assignees = (assigneesRes.data ?? [])
      .filter((row) => (adminUserId ? row.user_id !== adminUserId : true))
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
      }));

    const groups = (groupsRes.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
    }));

    const groupByUserId = new Map(
      (membersRes.data ?? []).map((row) => [row.user_id as string, row.group_id as string | null]),
    );
    const assigneeGroupMap = (assigneesRes.data ?? []).reduce<Record<string, string | null>>((acc, row) => {
      const groupId = row.user_id ? groupByUserId.get(row.user_id as string) ?? null : null;
      acc[row.id as string] = groupId;
      return acc;
    }, {});

    set({ statuses, projects, assignees, groups, assigneeGroupMap });
  },
  loadMilestones: async (workspaceId) => {
    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, project_id, date')
      .eq('workspace_id', workspaceId)
      .order('date', { ascending: true });

    if (error) {
      set({ error: error.message });
      return;
    }

    const milestones = (data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      projectId: row.project_id as string,
      date: row.date as string,
    }));

    set({ milestones });
  },
  loadStats: async (workspaceId, period, includeSeries = false) => {
    const current = get().statsByPeriod[period];
    const now = Date.now();
    const hasFreshData = Boolean(current.lastLoaded) && now - (current.lastLoaded ?? 0) < STATS_CACHE_TTL_MS;
    const hasSeriesData = current.seriesRows.length > 0 || current.seriesRowsBase.length > 0;
    if (current.loading) return;
    if (hasFreshData && (!includeSeries || hasSeriesData)) return;
    set((state) => ({
      statsByPeriod: {
        ...state.statsByPeriod,
        [period]: { ...state.statsByPeriod[period], loading: true, error: null },
      },
    }));
    const { startDate, endDate } = getPeriodRange(period);
    const [aggregateRes, aggregateBaseRes, seriesRes, seriesBaseRes] = await Promise.all([
      supabase
        .rpc('dashboard_task_counts', {
          p_workspace_id: workspaceId,
          p_start_date: startDate,
          p_end_date: endDate,
        }),
      supabase
        .rpc('dashboard_task_counts_base', {
          p_workspace_id: workspaceId,
          p_start_date: startDate,
          p_end_date: endDate,
        }),
      includeSeries
        ? supabase.rpc('dashboard_task_time_series', {
          p_workspace_id: workspaceId,
          p_start_date: startDate,
          p_end_date: endDate,
        })
        : Promise.resolve({ data: [], error: null }),
      includeSeries
        ? supabase.rpc('dashboard_task_time_series_base', {
          p_workspace_id: workspaceId,
          p_start_date: startDate,
          p_end_date: endDate,
        })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (aggregateRes.error || aggregateBaseRes.error || seriesRes.error || seriesBaseRes.error) {
      set((state) => ({
        statsByPeriod: {
          ...state.statsByPeriod,
          [period]: {
            ...state.statsByPeriod[period],
            loading: false,
            error: aggregateRes.error?.message
              || aggregateBaseRes.error?.message
              || seriesRes.error?.message
              || seriesBaseRes.error?.message
              || 'Failed to load stats.',
          },
        },
      }));
      return;
    }
    const rows = (aggregateRes.data ?? []).map((row: DashboardStatsRow & { total: number | string }) => ({
      ...row,
      total: Number(row.total),
    }));
    const rowsBase = (aggregateBaseRes.data ?? []).map((row: DashboardStatsRow & { total: number | string }) => ({
      ...row,
      total: Number(row.total),
    }));
    const seriesRows = (seriesRes.data ?? []).map((row: DashboardSeriesRow & { total: number | string }) => ({
      ...row,
      total: Number(row.total),
    }));
    const seriesRowsBase = (seriesBaseRes.data ?? []).map((row: DashboardSeriesRow & { total: number | string }) => ({
      ...row,
      total: Number(row.total),
    }));
    set((state) => ({
      statsByPeriod: {
        ...state.statsByPeriod,
        [period]: {
          rows,
          rowsBase,
          seriesRows,
          seriesRowsBase,
          loading: false,
          error: null,
          lastLoaded: Date.now(),
        },
      },
    }));
  },
}));

export { DASHBOARD_BREAKPOINTS, DASHBOARD_COLS, getClosestWidgetSize };
