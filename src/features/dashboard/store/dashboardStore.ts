import { create } from 'zustand';
import { supabase } from '@/shared/lib/supabaseClient';
import { DashboardLayouts, DashboardWidget } from '@/features/dashboard/types/dashboard';
import {
  DASHBOARD_BREAKPOINTS,
  DASHBOARD_COLS,
} from '@/features/dashboard/lib/dashboardResponsive';
import {
  addWidgetToLayouts,
  applyWidgetConstraints,
  buildDefaultLayouts,
  createDefaultWidgets,
  getClosestWidgetSize,
  layoutsEqual,
  normalizeLayouts,
  normalizeWidget,
  normalizeWidgetSize,
} from '@/features/dashboard/lib/dashboardLayout';
import {
  createEmptyStatsByPeriod,
  type DashboardState,
  EMPTY_HEATMAP,
  EMPTY_TIME_OFF,
} from '@/features/dashboard/store/dashboardStore.contract';
import { createDashboardDataActions } from '@/features/dashboard/store/dashboardStore.dataActions';

export const useDashboardStore = create<DashboardState>((set, get) => ({
  widgets: [],
  layouts: {},
  statuses: [],
  projects: [],
  assignees: [],
  groups: [],
  assigneeGroupMap: {},
  milestones: [],
  heatmap: EMPTY_HEATMAP,
  heatmapAutoCapacity: null,
  timeOff: EMPTY_TIME_OFF,
  loading: false,
  saving: false,
  error: null,
  dirty: false,
  statsByPeriod: createEmptyStatsByPeriod(),
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
      statsByPeriod: createEmptyStatsByPeriod(),
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
    heatmap: EMPTY_HEATMAP,
    heatmapAutoCapacity: null,
    timeOff: EMPTY_TIME_OFF,
    loading: false,
    saving: false,
    error: null,
    dirty: false,
    statsByPeriod: createEmptyStatsByPeriod(),
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
  setLayouts: (layouts) => set((state) => {
    const normalized = normalizeLayouts(layouts, state.widgets);
    // No-op guard: if normalization leaves the layout unchanged, don't touch
    // state — otherwise react-grid-layout's onLayoutChange keeps re-emitting an
    // identical layout, marking the dashboard dirty and jittering the grid.
    if (layoutsEqual(normalized, state.layouts)) return {};
    return { layouts: normalized, dirty: true };
  }),
  ...createDashboardDataActions(set, get),
}));

export { DASHBOARD_BREAKPOINTS, DASHBOARD_COLS, getClosestWidgetSize };
