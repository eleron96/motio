import React, { Suspense } from 'react';
import { t } from '@lingui/macro';
import { lazyNamed } from '@/shared/lib/lazyComponent';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { getClosestWidgetSize } from '@/features/dashboard/store/dashboardStore';
import type { DashboardState } from '@/features/dashboard/store/dashboardStore.contract';
import {
  DASHBOARD_COLS,
  type DashboardBreakpoint,
  type DashboardViewportProfile,
} from '@/features/dashboard/lib/dashboardResponsive';
import { buildTimeSeriesData, buildWidgetData, shouldUseAssigneeRows } from '@/features/dashboard/lib/dashboardUtils';
import { getWidgetStatsVariantKey, isTaskWidget } from '@/features/dashboard/lib/dashboardWidgetKinds';
import type { WidgetTouchReorder } from '@/features/dashboard/hooks/useWidgetTouchReorder';
import type { DashboardWidget } from '@/features/dashboard/types/dashboard';

const DashboardWidgetCard = lazyNamed(
  () => import('@/features/dashboard/components/DashboardWidgetCard'),
  'DashboardWidgetCard'
);

interface DashboardWidgetSlotProps {
  widget: DashboardWidget;
  layouts: DashboardState['layouts'];
  statsByPeriod: DashboardState['statsByPeriod'];
  assigneeGroupMap: DashboardState['assigneeGroupMap'];
  statuses: DashboardState['statuses'];
  projects: DashboardState['projects'];
  assignees: DashboardState['assignees'];
  milestones: DashboardState['milestones'];
  canEdit: boolean;
  currentBreakpoint: DashboardBreakpoint;
  viewportProfile: DashboardViewportProfile;
  isTouchReorderMode: boolean;
  touchReorder: WidgetTouchReorder;
  onEdit: (widget: DashboardWidget) => void;
  onRemove: (widgetId: string) => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * One widget on the grid: its size at the current breakpoint, the data built
 * from the stats it reads, and its right-click menu (none on a touch screen).
 */
export const DashboardWidgetSlot: React.FC<DashboardWidgetSlotProps> = ({
  widget,
  layouts,
  statsByPeriod,
  assigneeGroupMap,
  statuses,
  projects,
  assignees,
  milestones,
  canEdit,
  currentBreakpoint,
  viewportProfile,
  isTouchReorderMode,
  touchReorder,
  onEdit,
  onRemove,
  onContextMenu,
}) => {
  const {
    mobileDragArmedWidgetId,
    mobileDragPressingWidgetId,
    handleWidgetDragHoldStart,
    handleWidgetDragHoldMove,
    handleWidgetDragHoldEnd,
  } = touchReorder;
  const cols = DASHBOARD_COLS[currentBreakpoint] ?? DASHBOARD_COLS.lg;
  const layoutItem = (layouts[currentBreakpoint] ?? []).find((item) => item.i === widget.id);
  const effectiveSize = layoutItem
    ? getClosestWidgetSize(layoutItem.w, layoutItem.h, cols, widget.type)
    : (widget.size ?? (widget.type === 'kpi' ? 'small' : 'medium'));
  const statsState = statsByPeriod[widget.period][getWidgetStatsVariantKey(widget)];
  const taskWidget = isTaskWidget(widget);
  const useAssigneeRows = shouldUseAssigneeRows(widget);
  const rows = useAssigneeRows ? statsState?.rows : (statsState?.rowsBase ?? statsState?.rows);
  const seriesRows = useAssigneeRows ? statsState?.seriesRows : (statsState?.seriesRowsBase ?? statsState?.seriesRows);
  const rowsWithGroups = (rows ?? []).map((row) => ({
    ...row,
    group_id: row.assignee_id ? assigneeGroupMap[row.assignee_id] ?? null : null,
  }));
  const seriesRowsWithGroups = (seriesRows ?? []).map((row) => ({
    ...row,
    group_id: row.assignee_id ? assigneeGroupMap[row.assignee_id] ?? null : null,
  }));
  const data = statsState && taskWidget
    ? (widget.type === 'line' || widget.type === 'area'
      ? buildTimeSeriesData(seriesRowsWithGroups, widget, statuses, projects)
      : buildWidgetData(rowsWithGroups, widget, statuses, projects))
    : null;
  const loading = taskWidget ? (statsState?.loading ?? false) : false;
  const widgetError = taskWidget ? (statsState?.error ?? null) : null;
  const widgetWithSize = { ...widget, size: effectiveSize };
  const widgetNode = (
    <div className="h-full w-full" onContextMenu={onContextMenu}>
      <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-muted" />}>
      <DashboardWidgetCard
        widget={widgetWithSize}
        data={data}
        loading={loading}
        error={widgetError}
        editing={canEdit}
        milestones={milestones}
        projects={projects}
        assignees={assignees}
        statuses={statuses}
        breakpoint={currentBreakpoint}
        viewportProfile={viewportProfile}
        touchInteractionMode={isTouchReorderMode}
        dragHandleArmed={isTouchReorderMode && mobileDragArmedWidgetId === widget.id}
        dragHandlePressing={isTouchReorderMode && mobileDragPressingWidgetId === widget.id}
        onDragHandleTouchStart={(event) => handleWidgetDragHoldStart(widget.id, event)}
        onDragHandleTouchMove={handleWidgetDragHoldMove}
        onDragHandleTouchEnd={handleWidgetDragHoldEnd}
        onEdit={() => onEdit(widget)}
      />
      </Suspense>
    </div>
  );

  if (isTouchReorderMode) {
    return widgetNode;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {widgetNode}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onEdit(widget)} disabled={!canEdit}>
          {t`Filter settings`}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onRemove(widget.id)}
          disabled={!canEdit}
          className="text-destructive focus:text-destructive"
        >
          {t`Remove widget`}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
