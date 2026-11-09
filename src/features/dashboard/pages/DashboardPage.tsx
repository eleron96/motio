import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lazyNamed } from '@/shared/lib/lazyComponent';
import { ResponsiveGridLayout, verticalCompactor } from 'react-grid-layout';
import type { Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Plus } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useWorkspaceHeader } from '@/features/workspace/components/WorkspaceLayout';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MOBILE_FAB_BUTTON_CLASS } from '@/shared/ui/mobile-fab';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';
import { WorkspaceCommonDialogs } from '@/features/workspace/components/WorkspaceCommonDialogs';
import { cn } from '@/shared/lib/classNames';
import { useDashboardStore } from '@/features/dashboard/store/dashboardStore';
import {
  DASHBOARD_BREAKPOINTS,
  DASHBOARD_COLS,
  getDashboardCanvasMetrics,
  getViewportProfileForBreakpoint,
  type DashboardBreakpoint,
} from '@/features/dashboard/lib/dashboardResponsive';
const WorkloadHeatmapBoard = lazyNamed(
  () => import('@/features/dashboard/components/WorkloadHeatmapBoard'),
  'WorkloadHeatmapBoard'
);
const WorkloadHeatmapMobile = lazyNamed(
  () => import('@/features/dashboard/components/WorkloadHeatmapMobile'),
  'WorkloadHeatmapMobile'
);
import { WidgetEditorDialog } from '@/features/dashboard/components/WidgetEditorDialog';
import { DashboardManageDialogs } from '@/features/dashboard/components/DashboardManageDialogs';
import { DashboardSwitcher } from '@/features/dashboard/components/DashboardSwitcher';
import { DashboardWidgetSlot } from '@/features/dashboard/components/DashboardWidgetSlot';
import { useCoarsePointer } from '@/features/dashboard/hooks/useCoarsePointer';
import { useDashboardManageDialogs } from '@/features/dashboard/hooks/useDashboardManageDialogs';
import { useDashboardSync } from '@/features/dashboard/hooks/useDashboardSync';
import { useRemountSafeCanvasWidth } from '@/features/dashboard/hooks/useRemountSafeCanvasWidth';
import { useWidgetTouchReorder } from '@/features/dashboard/hooks/useWidgetTouchReorder';
import { DashboardLayouts, DashboardWidget } from '@/features/dashboard/types/dashboard';
import { Navigate } from 'react-router-dom';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { t } from '@lingui/macro';
import { usePageSeo } from '@/shared/lib/seo/usePageSeo';
import { useAppBasePath } from '@/features/demo/hooks/useIsDemo';

type DashboardView = 'dashboards' | 'heatmap';

const DashboardPage = () => {
  usePageSeo({
    title: 'Motio — Dashboard',
    description: 'Private dashboard workspace in Motio.',
    canonicalPath: '/app/dashboard',
    robots: 'noindex, nofollow',
  });

  // Redirects stay in the section we are in: /demo in the sandbox.
  const basePath = useAppBasePath();
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [view, setView] = useState<DashboardView>('dashboards');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const [currentBreakpoint, setCurrentBreakpoint] = useState<DashboardBreakpoint>('lg');
  const prevWorkspaceIdRef = useRef<string | null>(null);
  const { width: canvasWidth, containerRef } = useRemountSafeCanvasWidth();
  const { settings: currentGridSettings, gridWidth: width } = getDashboardCanvasMetrics(canvasWidth);

  const {
    widgets,
    layouts,
    dashboards,
    currentDashboardId,
    statuses,
    projects,
    assignees,
    groups,
    assigneeGroupMap,
    milestones,
    loading,
    statsByPeriod,
    setCurrentDashboardId,
    saveDashboard,
    addWidget,
    updateWidget,
    removeWidget,
    setLayouts,
  } = useDashboardStore();

  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const workspaces = useAuthStore((state) => state.workspaces);
  const isSuperAdmin = useAuthStore((state) => state.isSuperAdmin);
  const workspacesLoaded = useAuthStore((state) => state.workspacesLoaded);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const isMobile = useIsMobile();
  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null,
    [workspaces, currentWorkspaceId],
  );
  const heatmapAvailable = Boolean(currentWorkspace?.heatmapEnabled);
  const isHeatmapView = view === 'heatmap' && heatmapAvailable;
  // A phone swipes between the two views, so both live in a deck. The heatmap
  // page mounts the first time it is opened and stays: its data is not worth
  // fetching for someone who never swipes over, and worth keeping once they do.
  const swipeLayout = isMobile && heatmapAvailable;
  const [heatmapMounted, setHeatmapMounted] = useState(false);
  useEffect(() => {
    if (isHeatmapView) setHeatmapMounted(true);
  }, [isHeatmapView]);

  const viewRestoredRef = useRef<string | null>(null);
  const selectView = useCallback((next: DashboardView) => {
    setView(next);
    if (currentWorkspaceId && typeof window !== 'undefined') {
      window.localStorage.setItem(`dashboard-view-${currentWorkspaceId}`, next);
    }
  }, [currentWorkspaceId]);

  // Restore the last chosen view (dashboards vs heatmap) so a refresh keeps the
  // heatmap open. Wait until the workspaces are loaded so heatmapAvailable is real.
  useEffect(() => {
    if (!currentWorkspaceId || workspaces.length === 0) return;
    if (viewRestoredRef.current === currentWorkspaceId) return;
    viewRestoredRef.current = currentWorkspaceId;
    if (
      heatmapAvailable
      && typeof window !== 'undefined'
      && window.localStorage.getItem(`dashboard-view-${currentWorkspaceId}`) === 'heatmap'
    ) {
      setView('heatmap');
    }
  }, [currentWorkspaceId, workspaces.length, heatmapAvailable]);

  useEffect(() => {
    if (!heatmapAvailable && view === 'heatmap') {
      selectView('dashboards');
    }
  }, [heatmapAvailable, view, selectView]);

  const loadWorkspaceData = usePlannerStore((state) => state.loadWorkspaceData);
  const currentDashboard = dashboards.find((dashboard) => dashboard.id === currentDashboardId);
  const canCreateDashboard = dashboards.length < 10;
  const canDeleteDashboard = dashboards.length > 1 && Boolean(currentDashboardId);
  const canAddWidget = canEdit && Boolean(currentDashboardId);
  const isWorkspaceSwitching = Boolean(
    prevWorkspaceIdRef.current
    && currentWorkspaceId
    && prevWorkspaceIdRef.current !== currentWorkspaceId,
  );
  const isTouchPointer = useCoarsePointer();
  const currentViewportProfile = getViewportProfileForBreakpoint(currentBreakpoint, width);
  const isTouchDashboardViewport = currentViewportProfile === 'phone'
    || currentViewportProfile === 'tablet'
    || currentViewportProfile === 'laptop';
  const isTouchReorderMode = isTouchPointer && isTouchDashboardViewport;
  const dragHandleSelector = isTouchReorderMode
    ? '.dashboard-widget-handle-mobile-armed'
    : '.dashboard-widget-handle';

  useEffect(() => {
    if (!currentWorkspaceId) return;
    prevWorkspaceIdRef.current = currentWorkspaceId;
  }, [currentWorkspaceId]);

  useDashboardSync({ currentWorkspaceId, isWorkspaceSwitching, canEdit });

  useEffect(() => {
    if (!showSettings || !currentWorkspaceId || isWorkspaceSwitching) return;
    loadWorkspaceData(currentWorkspaceId);
  }, [currentWorkspaceId, isWorkspaceSwitching, loadWorkspaceData, showSettings]);

  const dashboardDialogs = useDashboardManageDialogs({
    currentWorkspaceId,
    currentDashboardId,
    currentDashboardName: currentDashboard?.name,
    canCreateDashboard,
  });
  const touchReorder = useWidgetTouchReorder({ canEdit, isTouchReorderMode });
  const {
    mobileDragArmedWidgetId,
    mobileDragPressingWidgetId,
    handleGridDragStart,
    handleGridDragStop,
  } = touchReorder;
  const dragEnabled = canEdit && (!isTouchReorderMode || mobileDragArmedWidgetId !== null);

  useWorkspaceHeader(
    {
      primaryAction: canEdit && !isHeatmapView ? (
        <Button
          data-tour="dashboard-add-widget"
          size={isMobile ? 'default' : 'sm'}
          className={isMobile ? MOBILE_FAB_BUTTON_CLASS : 'gap-2'}
          onClick={() => {
            setEditingWidget(null);
            setEditorOpen(true);
          }}
          disabled={!canAddWidget}
        >
          <Plus className="h-4 w-4" />
          {t`Widget`}
        </Button>
      ) : null,
      onOpenSettings: () => setShowSettings(true),
      onOpenAccountSettings: () => setShowAccountSettings(true),
    },
    [canEdit, canAddWidget, isHeatmapView, isMobile],
  );

  if (isSuperAdmin && workspacesLoaded && workspaces.length === 0) {
    return <Navigate to="/app/admin" replace />;
  }

  if (isWorkspaceSwitching) {
    return <Navigate to={basePath} replace />;
  }

  const handleLayoutChange = (_layout: Layout, allLayouts: Partial<Record<string, Layout>>) => {
    if (!canEdit) return;
    setLayouts(allLayouts as DashboardLayouts);
  };

  const handleResizeStop = () => {
    if (!canEdit) return;
    if (typeof window !== 'undefined') {
      window.getSelection?.()?.removeAllRanges();
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleBreakpointChange = (breakpoint: string) => {
    if (breakpoint in DASHBOARD_COLS) {
      setCurrentBreakpoint(breakpoint as DashboardBreakpoint);
    }
  };

  const persistDashboard = () => {
    if (!currentWorkspaceId || !canEdit || !currentDashboardId) return;
    saveDashboard(currentWorkspaceId, currentDashboardId);
  };

  const handleAddWidget = () => {
    setEditingWidget(null);
    setEditorOpen(true);
  };

  const handleEditWidget = (widget: DashboardWidget) => {
    setEditingWidget(widget);
    setEditorOpen(true);
  };

  const handleSaveWidget = (widget: DashboardWidget) => {
    if (editingWidget) {
      updateWidget(widget.id, widget);
      persistDashboard();
    } else {
      addWidget(widget);
      persistDashboard();
    }
  };

  const handleRemoveWidget = (widgetId: string) => {
    removeWidget(widgetId);
    persistDashboard();
  };

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isHeatmapView) return;
    if (isTouchReorderMode) return;
    if (!canAddWidget) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.dashboard-toolbar')) return;
    if (target.closest('.dashboard-grid-item')) return;
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return;
    handleAddWidget();
  };

  const handleDashboardContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isTouchReorderMode) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const toggleButtonClass = swipeLayout ? 'h-9 px-4 text-xs' : 'h-8 px-3 text-xs';
  const viewToggle = heatmapAvailable ? (
    <div className="mr-1 inline-flex items-center rounded-md border border-border p-0.5">
      <Button
        variant={isHeatmapView ? 'ghost' : 'secondary'}
        className={toggleButtonClass}
        onClick={() => selectView('dashboards')}
      >
        {t`Dashboards`}
      </Button>
      <Button
        variant={isHeatmapView ? 'secondary' : 'ghost'}
        className={toggleButtonClass}
        onClick={() => selectView('heatmap')}
      >
        {t`Heatmap`}
      </Button>
    </div>
  ) : null;

  const dashboardControls = (
    <DashboardSwitcher
      dashboards={dashboards}
      currentDashboardId={currentDashboardId}
      currentDashboardName={currentDashboard?.name}
      onSelectDashboard={setCurrentDashboardId}
      canEdit={canEdit}
      canCreateDashboard={canCreateDashboard}
      canDeleteDashboard={canDeleteDashboard}
      dialogs={dashboardDialogs}
      workspaceId={currentWorkspaceId}
    />
  );

  const heatmapFallback = (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {t`Loading workload...`}
    </div>
  );

  const dashboardsContent = (
    <>
      {canEdit && isTouchReorderMode && (
        <div className="mb-2 text-[11px] text-muted-foreground">
          {mobileDragArmedWidgetId
            ? t`Move mode is enabled. Drag the widget header.`
            : mobileDragPressingWidgetId
              ? t`Keep holding the widget header...`
              : t`Hold the widget header to enable moving.`}
        </div>
      )}
      {loading && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t`Loading dashboard...`}
        </div>
      )}
      {!loading && widgets.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {!currentDashboardId
            ? t`Create or select a dashboard to get started.`
            : canEdit
              ? (isTouchReorderMode ? t`Use the Widget button to add your first widget.` : t`Right-click to add your first widget.`)
              : t`No widgets yet.`}
        </div>
      )}
      {!loading && widgets.length > 0 && (
        <ResponsiveGridLayout
          layouts={layouts}
          breakpoints={DASHBOARD_BREAKPOINTS}
          cols={DASHBOARD_COLS}
          width={width}
          rowHeight={currentGridSettings.rowHeight}
          margin={currentGridSettings.margin}
          containerPadding={currentGridSettings.containerPadding}
          dragConfig={{
            enabled: dragEnabled,
            handle: dragHandleSelector,
            threshold: 3,
          }}
          resizeConfig={{
            enabled: canEdit,
            handles: ['se'],
          }}
          onLayoutChange={handleLayoutChange}
          onDragStart={handleGridDragStart}
          onDragStop={handleGridDragStop}
          onResizeStop={handleResizeStop}
          onBreakpointChange={handleBreakpointChange}
          // Real vertical compaction: widgets float up into holes left by a
          // resize, a deleted widget or a narrower breakpoint.
          compactor={verticalCompactor}
        >
          {widgets.map((widget) => (
            <div key={widget.id} className="dashboard-grid-item h-full w-full">
              <DashboardWidgetSlot
                widget={widget}
                layouts={layouts}
                statsByPeriod={statsByPeriod}
                assigneeGroupMap={assigneeGroupMap}
                statuses={statuses}
                projects={projects}
                assignees={assignees}
                milestones={milestones}
                canEdit={canEdit}
                currentBreakpoint={currentBreakpoint}
                viewportProfile={currentViewportProfile}
                isTouchReorderMode={isTouchReorderMode}
                touchReorder={touchReorder}
                onEdit={handleEditWidget}
                onRemove={handleRemoveWidget}
                onContextMenu={handleDashboardContextMenu}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </>
  );

  const canvasPadding = `${currentGridSettings.containerPadding[1]}px ${currentGridSettings.containerPadding[0]}px`;
  const toolbarGap = Math.max(8, currentGridSettings.margin[1]);

  const dashboardCanvas = swipeLayout ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* The toggle stays put above the deck: it is the indicator of which
          page is under the finger, so it must not slide along with the page. */}
      <div
        className="dashboard-toolbar flex shrink-0 items-center gap-2"
        style={{
          padding: `${currentGridSettings.containerPadding[1]}px ${currentGridSettings.containerPadding[0]}px 0`,
        }}
      >
        {viewToggle}
      </div>
      {/* A widget being moved or resized owns its drag; the deck must not page under it. */}
      <MobileSwipeDeck
        index={isHeatmapView ? 1 : 0}
        count={2}
        onIndexChange={(next) => selectView(next === 1 ? 'heatmap' : 'dashboards')}
        ignoreSelector=".dashboard-widget-handle-mobile-armed, .react-resizable-handle"
      >
        <div
          ref={containerRef}
          data-tour="dashboard-canvas"
          className={cn(
            'h-full overflow-y-auto overflow-x-hidden',
            isTouchReorderMode && 'dashboard-mobile-interactions',
          )}
          style={{ padding: canvasPadding }}
          onDoubleClick={handleCanvasDoubleClick}
          onContextMenu={handleDashboardContextMenu}
        >
          <div
            className="dashboard-toolbar flex flex-wrap items-center gap-2"
            style={{ marginBottom: toolbarGap }}
          >
            {dashboardControls}
          </div>
          {dashboardsContent}
        </div>
        <div className="h-full min-h-0">
          {(isHeatmapView || heatmapMounted) && (
            <Suspense fallback={heatmapFallback}>
              <WorkloadHeatmapMobile />
            </Suspense>
          )}
        </div>
      </MobileSwipeDeck>
    </div>
  ) : (
    <div
      ref={containerRef}
      data-tour="dashboard-canvas"
      className={cn('flex-1 overflow-auto', isTouchReorderMode && 'dashboard-mobile-interactions')}
      style={{ padding: canvasPadding }}
      onDoubleClick={handleCanvasDoubleClick}
      onContextMenu={handleDashboardContextMenu}
    >
      <div
        className="dashboard-toolbar flex flex-wrap items-center gap-2"
        style={{ marginBottom: toolbarGap }}
      >
        {viewToggle}
        {!isHeatmapView && dashboardControls}
      </div>
      {isHeatmapView ? (
        <Suspense fallback={heatmapFallback}>
          <WorkloadHeatmapBoard />
        </Suspense>
      ) : dashboardsContent}
    </div>
  );

  return (
    <>
      {isTouchReorderMode || isHeatmapView ? (
        dashboardCanvas
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {dashboardCanvas}
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={handleAddWidget} disabled={!canAddWidget}>
              {t`Add widget`}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}

      <WidgetEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        statuses={statuses}
        projects={projects}
        assignees={assignees}
        groups={groups}
        initialWidget={editingWidget}
        onSave={handleSaveWidget}
        onDelete={handleRemoveWidget}
      />
      <DashboardManageDialogs
        dialogs={dashboardDialogs}
        canEdit={canEdit}
        canCreateDashboard={canCreateDashboard}
        canDeleteDashboard={canDeleteDashboard}
        currentDashboardName={currentDashboard?.name}
      />
      <WorkspaceCommonDialogs
        showSettings={showSettings}
        onShowSettingsChange={setShowSettings}
        showAccountSettings={showAccountSettings}
        onShowAccountSettingsChange={setShowAccountSettings}
      />
    </>
  );
};

export default DashboardPage;
