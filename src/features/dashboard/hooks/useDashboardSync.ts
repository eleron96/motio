import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';
import { resolveDashboardIncludeDisabledAssignees } from '@/features/dashboard/lib/dashboardAssigneeOptions';
import { isTaskWidget, isTimeSeriesWidget } from '@/features/dashboard/lib/dashboardWidgetKinds';
import type { DashboardWidget } from '@/features/dashboard/types/dashboard';

interface UseDashboardSyncOptions {
  currentWorkspaceId: string | null;
  /** The page is about to redirect away: load nothing for the old workspace. */
  isWorkspaceSwitching: boolean;
  canEdit: boolean;
}

/**
 * Keeps the dashboard page in step with the server: loads the workspace's
 * dashboards and picks the current one (remembered per workspace), loads its
 * widgets and the stats they read, and autosaves edits behind a toast.
 */
export const useDashboardSync = ({ currentWorkspaceId, isWorkspaceSwitching, canEdit }: UseDashboardSyncOptions) => {
  const {
    widgets,
    layouts,
    dashboards,
    dashboardsWorkspaceId,
    currentDashboardId,
    saving,
    dirty,
    error,
    loadDashboards,
    setCurrentDashboardId,
    loadDashboard,
    saveDashboard,
    resetDashboardState,
    loadFilterOptions,
    loadMilestones,
    loadStats,
  } = useDashboardStore(useShallow((state) => ({
    widgets: state.widgets,
    layouts: state.layouts,
    dashboards: state.dashboards,
    dashboardsWorkspaceId: state.dashboardsWorkspaceId,
    currentDashboardId: state.currentDashboardId,
    saving: state.saving,
    dirty: state.dirty,
    error: state.error,
    loadDashboards: state.loadDashboards,
    setCurrentDashboardId: state.setCurrentDashboardId,
    loadDashboard: state.loadDashboard,
    saveDashboard: state.saveDashboard,
    resetDashboardState: state.resetDashboardState,
    loadFilterOptions: state.loadFilterOptions,
    loadMilestones: state.loadMilestones,
    loadStats: state.loadStats,
  })));
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dashboardStorageKey = currentWorkspaceId
    ? `dashboard-current-${currentWorkspaceId}`
    : 'dashboard-current';
  const dashboardsReady = dashboardsWorkspaceId === currentWorkspaceId;
  const hasCurrentDashboard = Boolean(
    currentDashboardId && dashboards.some((dashboard) => dashboard.id === currentDashboardId),
  );

  useEffect(() => {
    if (!currentWorkspaceId || isWorkspaceSwitching) return;
    resetDashboardState();
    loadDashboards(currentWorkspaceId);
    loadFilterOptions(currentWorkspaceId);
    loadMilestones(currentWorkspaceId);
  }, [currentWorkspaceId, isWorkspaceSwitching, loadDashboards, loadFilterOptions, loadMilestones, resetDashboardState]);

  useEffect(() => {
    if (!currentWorkspaceId || !dashboardsReady) return;
    if (dashboards.length === 0) {
      setCurrentDashboardId(null);
      return;
    }
    if (isWorkspaceSwitching) return;
    if (!currentDashboardId || !dashboards.some((dashboard) => dashboard.id === currentDashboardId)) {
      let nextId: string | null = null;
      if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem(dashboardStorageKey);
        if (saved && dashboards.some((dashboard) => dashboard.id === saved)) {
          nextId = saved;
        }
      }
      if (!nextId) {
        nextId = dashboards[0]?.id ?? null;
      }
      setCurrentDashboardId(nextId);
      return;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(dashboardStorageKey, currentDashboardId);
    }
  }, [
    currentDashboardId,
    currentWorkspaceId,
    dashboardStorageKey,
    dashboards,
    dashboardsReady,
    isWorkspaceSwitching,
    setCurrentDashboardId,
  ]);

  useEffect(() => {
    if (!currentWorkspaceId || isWorkspaceSwitching || !dashboardsReady) return;
    if (!currentDashboardId || !hasCurrentDashboard) return;
    loadDashboard(currentWorkspaceId, currentDashboardId);
  }, [
    currentDashboardId,
    currentWorkspaceId,
    dashboardsReady,
    hasCurrentDashboard,
    isWorkspaceSwitching,
    loadDashboard,
  ]);

  const activeOnlyTaskWidgetPeriods = useMemo(() => (
    widgets
      .filter((widget) => isTaskWidget(widget) && !resolveDashboardIncludeDisabledAssignees(widget))
      .map((widget) => widget.period)
  ), [widgets]);

  const includeDisabledTaskWidgetPeriods = useMemo(() => (
    widgets
      .filter((widget) => isTaskWidget(widget) && resolveDashboardIncludeDisabledAssignees(widget))
      .map((widget) => widget.period)
  ), [widgets]);

  const activeOnlyPeriodsKey = useMemo(() => (
    Array.from(new Set(activeOnlyTaskWidgetPeriods)).sort().join('|')
  ), [activeOnlyTaskWidgetPeriods]);

  const includeDisabledPeriodsKey = useMemo(() => (
    Array.from(new Set(includeDisabledTaskWidgetPeriods)).sort().join('|')
  ), [includeDisabledTaskWidgetPeriods]);

  const activeOnlySeriesPeriodsKey = useMemo(() => (
    Array.from(
      new Set(
        widgets
          .filter((widget) => isTimeSeriesWidget(widget) && !resolveDashboardIncludeDisabledAssignees(widget))
          .map((widget) => widget.period),
      ),
    )
      .sort()
      .join('|')
  ), [widgets]);

  const includeDisabledSeriesPeriodsKey = useMemo(() => (
    Array.from(
      new Set(
        widgets
          .filter((widget) => isTimeSeriesWidget(widget) && resolveDashboardIncludeDisabledAssignees(widget))
          .map((widget) => widget.period),
      ),
    )
      .sort()
      .join('|')
  ), [widgets]);

  useEffect(() => {
    if (!currentWorkspaceId || isWorkspaceSwitching) return;
    const activeOnlyPeriods = activeOnlyPeriodsKey ? activeOnlyPeriodsKey.split('|') : [];
    const activeOnlySeriesPeriods = new Set(activeOnlySeriesPeriodsKey ? activeOnlySeriesPeriodsKey.split('|') : []);
    activeOnlyPeriods.forEach((period) => loadStats(
      currentWorkspaceId,
      period as DashboardWidget['period'],
      activeOnlySeriesPeriods.has(period),
      false,
    ));
    const includeDisabledPeriods = includeDisabledPeriodsKey ? includeDisabledPeriodsKey.split('|') : [];
    const includeDisabledSeriesPeriods = new Set(
      includeDisabledSeriesPeriodsKey ? includeDisabledSeriesPeriodsKey.split('|') : [],
    );
    includeDisabledPeriods.forEach((period) => loadStats(
      currentWorkspaceId,
      period as DashboardWidget['period'],
      includeDisabledSeriesPeriods.has(period),
      true,
    ));
  }, [
    activeOnlyPeriodsKey,
    activeOnlySeriesPeriodsKey,
    currentWorkspaceId,
    includeDisabledPeriodsKey,
    includeDisabledSeriesPeriodsKey,
    isWorkspaceSwitching,
    loadStats,
  ]);

  // Surface the save lifecycle as a single transient toast (Saving… → All changes
  // saved) instead of a persistent status row, which read as an empty line at rest.
  const wasSavingRef = useRef(false);
  useEffect(() => {
    if (saving) {
      toast.loading(t`Saving...`, { id: 'dashboard-save' });
    } else if (wasSavingRef.current && !error) {
      toast.success(t`All changes saved`, { id: 'dashboard-save' });
    }
    wasSavingRef.current = saving;
  }, [saving, error]);

  useEffect(() => {
    if (error) toast.error(error, { id: 'dashboard-save' });
  }, [error]);

  useEffect(() => {
    if (!canEdit || !dirty || !currentWorkspaceId || !currentDashboardId || isWorkspaceSwitching) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDashboard(currentWorkspaceId, currentDashboardId);
    }, 800);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [canEdit, currentDashboardId, dirty, isWorkspaceSwitching, widgets, layouts, currentWorkspaceId, saveDashboard]);
};
