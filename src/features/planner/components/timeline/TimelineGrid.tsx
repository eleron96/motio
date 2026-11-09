import React, { useCallback, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useTaskSearchStore } from '@/features/planner/store/taskSearchStore';
import { isSearchableQuery } from '@/shared/domain/taskSearch';
import { useTimelineTasks } from '@/features/planner/hooks/useTimelineTasks';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { useAuthStore } from '@/features/auth/store/authStore';
import { TimelineHeader } from './TimelineHeader';
import { TimelineRow } from './TimelineRow';
import { MilestoneDialog } from './MilestoneDialog';
import { TimeOffEditDialog } from './TimeOffEditDialog';
import { MilestoneLayer } from './MilestoneLayer';
import { getVisibleDays, getDayWidth } from '@/features/planner/lib/dateUtils';
import { ViewMode } from '@/features/planner/types/planner';
import { NO_TIME_OFF } from '@/features/planner/lib/timeOff';
import { resolveTimelineSidebarWidth } from '@/features/planner/lib/timelineSidebarWidth';
import {
  buildAssigneeGroupMap,
  resolveCurrentUserAssigneeId,
  selectArchivedProjectIds,
} from '@/features/planner/lib/timelineSelectors';
import { cn } from '@/shared/lib/classNames';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { format, parseISO } from 'date-fns';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { getPersonMonogram } from '@/shared/domain/personName';
import { useDragScroll } from './hooks/useDragScroll';
import { DRAG_EDGE_ZONE_PX } from '@/features/planner/lib/dragAutoScroll';
import { isWithinPanGrace } from '@/features/planner/lib/panGrace';
import {
  IDLE_TASK_DRAG_STATE,
  TimelineDragScrollContext,
  type TaskDragState,
  type TimelineDragScrollController,
} from './TimelineDragScrollContext';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useTimelineViewport } from './hooks/useTimelineViewport';
import { useTimelineScroll, LEFT_CONTEXT_DAYS } from './hooks/useTimelineScroll';
import { useMilestoneDisplay } from './hooks/useMilestoneDisplay';
import { useTaskDisplayRows } from './hooks/useTaskDisplayRows';
import { useRangeShifting } from './hooks/useRangeShifting';
import { useTimelineHolidays } from './hooks/useTimelineHolidays';
import { useTimelineTimeOff } from './hooks/useTimelineTimeOff';
import { useTimelineViewportSync } from './hooks/useTimelineViewportSync';
import { useCreateTaskAt, type TimelineNewTaskDefaults } from './hooks/useCreateTaskAt';
import { useAssigneeAvatarInfo } from './hooks/useAssigneeAvatarInfo';
import { TimelineSidebarRow } from './TimelineSidebarRow';
import { TimelineTodayButton } from './TimelineTodayButton';

const SCROLL_REANCHOR_MIN_SHIFT_DAYS: Record<ViewMode, number> = {
  day: 3,
  week: 10,
  calendar: 21,
};
const SCROLL_REANCHOR_EDGE_TRIGGER_DAYS: Record<ViewMode, number> = {
  day: 10,
  week: 14,
  calendar: 21,
};
interface TimelineGridProps {
  onCreateTask?: (payload: TimelineNewTaskDefaults) => void;
  sidebarWidth?: number | null;
  onSidebarWidthChange?: (width: number) => void;
  onSidebarWidthReset?: () => void;
}

export const TimelineGrid: React.FC<TimelineGridProps> = ({
  onCreateTask,
  sidebarWidth = null,
  onSidebarWidthChange,
  onSidebarWidthReset,
}) => {
  const todayKey = useTodayKey();
  const isMobile = useIsMobile();
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const tasks = useTimelineTasks();
  const plannerLoading = usePlannerStore((state) => state.loading);
  const milestones = usePlannerStore((state) => state.milestones);
  // NO_TIME_OFF (frozen constant), not `?? []`: partial store mocks in tests do
  // not carry the field, and a fresh array each render would defeat the row memo.
  const timeOff = usePlannerStore((state) => state.timeOff ?? NO_TIME_OFF);
  const timeOffDragPreview = usePlannerStore((state) => state.timeOffDragPreview ?? null);
  const projects = usePlannerStore((state) => state.projects);
  const assignees = usePlannerStore((state) => state.assignees);
  const memberGroupAssignments = usePlannerStore((state) => state.memberGroupAssignments);
  const viewMode = usePlannerStore((state) => state.viewMode);
  const groupMode = usePlannerStore((state) => state.groupMode);
  const currentDate = usePlannerStore((state) => state.currentDate);
  const setCurrentDate = usePlannerStore((state) => state.setCurrentDate);
  const requestScrollToDate = usePlannerStore((state) => state.requestScrollToDate);
  const scrollTargetDate = usePlannerStore((state) => state.scrollTargetDate);
  const scrollRequestId = usePlannerStore((state) => state.scrollRequestId);
  const filters = usePlannerStore((state) => state.filters);
  const highlightedTaskId = usePlannerStore((state) => state.highlightedTaskId);
  const highlightedTaskRowAssigneeId = usePlannerStore((state) => state.highlightedTaskRowAssigneeId);
  const timelineAttentionDate = usePlannerStore((state) => state.timelineAttentionDate);
  const setTimelineAttentionDate = usePlannerStore((state) => state.setTimelineAttentionDate);
  const markTimelineInteraction = usePlannerStore((state) => state.markTimelineInteraction);
  const setVisibleCenterDate = usePlannerStore((state) => state.setVisibleCenterDate);
  const searchActive = useTaskSearchStore((state) => state.open && isSearchableQuery(state.query));
  const searchFocusedId = useTaskSearchStore((state) => (state.open ? state.focusedId : null));
  const setSearchViewport = useTaskSearchStore((state) => state.setViewport);
  const user = useAuthStore((state) => state.user);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const workspaces = useAuthStore((state) => state.workspaces);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const members = useAuthStore((state) => state.members);
  const myProfilePreferences = useAuthStore((state) => state.profilePreferences);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const filteredAssignees = useFilteredAssignees(assignees);
  const activeFilteredAssignees = useMemo(
    () => filteredAssignees.filter((assignee) => assignee.isActive),
    [filteredAssignees],
  );

  const assigneeGroupMap = useMemo(
    () => buildAssigneeGroupMap(assignees, memberGroupAssignments),
    [assignees, memberGroupAssignments],
  );

  const myAssigneeId = useMemo(
    () => resolveCurrentUserAssigneeId(assignees, user?.id),
    [assignees, user?.id],
  );

  const [editingTimeOffId, setEditingTimeOffId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sidebarContainerRef = useRef<HTMLDivElement>(null);

  const {
    isMobileAssigneeTimeline,
    sidebarMinWidth,
    sidebarMaxWidth,
    resolvedSidebarWidth,
  } = resolveTimelineSidebarWidth({ sidebarWidth, isMobile, groupMode });

  const visibleDays = useMemo(() => getVisibleDays(currentDate, viewMode), [currentDate, viewMode]);
  const holidayDates = useTimelineHolidays({ visibleDays, workspaces, currentWorkspaceId });
  // Подсказку показываем, только когда на таймлайне действительно нет ни одной
  // задачи — не путать с «всё скрыто фильтрами», там пусто по воле человека,
  // и не путать с первыми секундами новичка: его пространство ещё создаётся на
  // сервере, задачи к нему уже едут, а «задач пока нет» — неправда.
  const workspaceReady = useAuthStore(
    (state) => state.workspacesLoaded && state.currentWorkspaceId !== null,
  );
  const showEmptyHint = useMemo(
    () => tasks.length === 0 && !plannerLoading && workspaceReady,
    [tasks.length, plannerLoading, workspaceReady],
  );

  // На доске проектов вехи архивных уезжают вместе со своими строками; в
  // группировке по участникам всё остаётся как было.
  const hiddenArchivedProjectIds = useMemo(() => {
    if (groupMode !== 'project') return undefined;
    const ids = selectArchivedProjectIds(projects);
    return ids.size > 0 ? ids : undefined;
  }, [projects, groupMode]);

  const { timeOffIndex, motifByRowId } = useTimelineTimeOff({
    groupMode,
    timeOff,
    timeOffDragPreview,
    visibleDays,
    assignees,
    myAssigneeId,
    myProfilePreferences,
  });

  const dayWidth = useMemo(() => getDayWidth(viewMode), [viewMode]);
  const rangeShifting = useRangeShifting(`${visibleDays[0]?.getTime() ?? ''}|${dayWidth}`);
  const totalWidth = visibleDays.length * dayWidth;
  const totalSurfaceWidth = `calc(${resolvedSidebarWidth} + ${totalWidth}px)`;
  const scrollReanchorMinShiftDays = SCROLL_REANCHOR_MIN_SHIFT_DAYS[viewMode];
  const scrollReanchorEdgeTriggerDays = SCROLL_REANCHOR_EDGE_TRIGGER_DAYS[viewMode];
  const currentDateObj = useMemo(() => parseISO(currentDate), [currentDate]);

  // ─── Custom hooks ─────────────────────────────────────────────────────────

  const { isDragScrolling, lastDragTimeRef, handleDragStart } = useDragScroll({ markTimelineInteraction });

  // Task-bar drag: the bars push this container when the cursor reaches an
  // edge strip (see dragAutoScroll). The controller reads refs so its identity
  // is stable and never re-renders the memoised bars.
  const [taskDragState, setTaskDragStateRaw] = useState<TaskDragState>(IDLE_TASK_DRAG_STATE);
  const dragScrollController = useMemo<TimelineDragScrollController>(() => ({
    getScrollContainer: () => scrollContainerRef.current,
    getViewportBounds: () => {
      const container = scrollContainerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      // The sidebar is sticky inside the same scroll container, so the date
      // area starts at its right edge; clientWidth excludes the scrollbar.
      const sidebarRight = sidebarContainerRef.current?.getBoundingClientRect().right ?? rect.left;
      return { left: Math.max(rect.left, sidebarRight), right: rect.left + container.clientWidth };
    },
    setTaskDragState: (next) => setTaskDragStateRaw((prev) => (
      prev.active === next.active && prev.edge === next.edge ? prev : next
    )),
    isPanGraceActive: () => isWithinPanGrace(lastDragTimeRef.current, Date.now()),
  }), [lastDragTimeRef]);

  const { isSidebarResizing, handleSidebarResizeStart, handleSidebarResizeReset } = useSidebarResize({
    sidebarContainerRef,
    sidebarMinWidth,
    sidebarMaxWidth,
    onSidebarWidthChange,
    onSidebarWidthReset,
  });

  const { viewportWidth, sidebarViewportWidth } = useTimelineViewport({
    scrollContainerRef,
    sidebarContainerRef,
    sidebarWidthKey: resolvedSidebarWidth,
  });

  // Mobile: keep "today" near the centre of the narrow viewport (1 day of left
  // context) instead of the desktop 2-day left bias that pushed it to the edge.
  const leftContextDays = isMobile ? 1 : LEFT_CONTEXT_DAYS;

  const { scrollLeft, handleScroll } = useTimelineScroll({
    scrollContainerRef,
    sidebarViewportWidth,
    viewportWidth,
    currentDate,
    currentDateObj,
    viewMode,
    dayWidth,
    visibleDays,
    // A deep link's highlight wins; otherwise the focused search match.
    highlightedTaskId: highlightedTaskId ?? searchFocusedId,
    highlightedTaskRowAssigneeId: highlightedTaskId ? highlightedTaskRowAssigneeId : null,
    tasksLength: tasks.length,
    scrollTargetDate,
    scrollRequestId,
    scrollReanchorMinShiftDays,
    scrollReanchorEdgeTriggerDays,
    setCurrentDate,
    markTimelineInteraction,
    isDragScrolling,
    isTaskDragActive: taskDragState.active,
    leftContextDays,
  });

  // ─── Derived display values ────────────────────────────────────────────────

  const showTodayButton = useTimelineViewportSync({
    visibleDays,
    dayWidth,
    scrollLeft,
    viewportWidth,
    sidebarViewportWidth,
    leftContextDays,
    todayKey,
    setVisibleCenterDate,
    setSearchViewport,
  });

  // ─── Milestone state, selectors, and handlers ─────────────────────────────

  const {
    milestoneDialogOpen,
    milestoneDialogDate,
    editingMilestone,
    milestoneLine,
    projectById,
    visibleDayIndex,
    visibleMilestoneLines,
    milestoneTooltipCells,
    effectiveHeaderHeight,
    milestoneRowHeight,
    milestoneLineTop,
    milestoneLineHeight,
    milestoneLineWidth,
    milestoneLineHoverWidth,
    milestoneHeaderRowTop,
    milestoneHeaderRowHeight,
    handleMilestoneDialogChange,
    handleCreateMilestone,
    handleEditMilestone,
    handleMilestoneHover,
    handleMilestoneHoverEnd,
  } = useMilestoneDisplay({
    milestones,
    filterProjectIds: filters.projectIds,
    visibleDays,
    projects,
    isMobile,
    hiddenProjectIds: hiddenArchivedProjectIds,
  });

  // ─── Task display ──────────────────────────────────────────────────────────

  const { displayRows, rowTaskElementsById, geometry } = useTaskDisplayRows({
    tasks,
    filters,
    assignees,
    activeFilteredAssignees,
    projects,
    groupMode,
    myAssigneeId,
    assigneeGroupMap,
    visibleDays,
    dayWidth,
    canEdit,
    sidebarViewportWidth,
    timeOffIndex,
    myAssigneeIdForTimeOff: myAssigneeId,
    canManageAnyTimeOff: currentWorkspaceRole === 'admin',
    onOpenTimeOff: setEditingTimeOffId,
    layoutScope: `${currentWorkspaceId ?? ''}|${viewMode}`,
  });

  // ─── Other handlers ────────────────────────────────────────────────────────

  const handleJumpToToday = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setCurrentDate(today);
    requestScrollToDate(today);
  };

  const clearTimelineAttention = useCallback(() => {
    if (!timelineAttentionDate) return;
    setTimelineAttentionDate(null);
  }, [setTimelineAttentionDate, timelineAttentionDate]);

  const handleCreateTaskAt = useCreateTaskAt({ groupMode, projects, assignees, lastDragTimeRef, onCreateTask });

  const getAssigneeAvatarInfo = useAssigneeAvatarInfo(assignees, members);

  const getSidebarRowMonogram = useCallback((rowName: string) => getPersonMonogram(rowName, 'U'), []);

  // Stable noop so MilestoneLayer's onCreateMilestone prop doesn't change every
  // render for non-editors (an inline `() => {}` would defeat its memo).
  const noopCreateMilestone = useCallback(() => {}, []);

  // Memoize the header element so MilestoneLayer receives a stable `children` prop
  // and its React.memo can bail on scroll ticks. Deps are the header's own inputs.
  const timelineHeaderElement = useMemo(() => (
    <TimelineHeader
      visibleDays={visibleDays}
      dayWidth={dayWidth}
      viewMode={viewMode}
      isMobile={isMobile}
      attentionDate={timelineAttentionDate}
      todayKey={todayKey}
      holidayDates={holidayDates}
      onDateContextAction={canEdit ? handleCreateMilestone : undefined}
    />
  ), [visibleDays, dayWidth, viewMode, isMobile, timelineAttentionDate, todayKey, holidayDates, canEdit, handleCreateMilestone]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={cn(
      'relative flex flex-col h-full overflow-hidden bg-background',
      // Mobile: long-press on the timeline (outside a task) must not start a
      // text selection or pop the native iOS callout/context menu. The task
      // bars' own long-press menu is JS-driven and unaffected.
      'max-md:select-none max-md:[-webkit-touch-callout:none]',
      highlightedTaskId && 'task-highlight-mode',
      searchActive && !highlightedTaskId && 'task-search-mode',
      isDragScrolling && 'timeline-drag-scroll-active',
    )}
    onPointerDownCapture={clearTimelineAttention}
    onWheelCapture={clearTimelineAttention}
    onTouchStartCapture={clearTimelineAttention}
    >
      {scrollLeft > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 z-40 transition-opacity duration-200"
          style={{
            left: resolvedSidebarWidth,
            width: 16,
            background: 'linear-gradient(to right, rgba(0,0,0,0.1), transparent)',
          }}
        />
      )}
      {/* Edge strips shown while a task bar is dragged: they mark where the
          timeline starts scrolling on its own, and brighten while it does.
          Opacity-only so the drag stays cheap; mouse passes through. */}
      {!isMobile && (['left', 'right'] as const).map((edge) => (
        <div
          key={edge}
          aria-hidden="true"
          data-testid={`timeline-drag-edge-${edge}`}
          data-active={taskDragState.edge === edge ? 'true' : undefined}
          className={cn(
            'pointer-events-none absolute top-0 bottom-0 z-40 transition-opacity duration-200 ease-out',
            !taskDragState.active && 'opacity-0',
            taskDragState.active && taskDragState.edge !== edge && 'timeline-drag-edge-idle',
            taskDragState.active && taskDragState.edge === edge && 'timeline-drag-edge-active',
          )}
          style={{
            ...(edge === 'left' ? { left: resolvedSidebarWidth } : { right: 0 }),
            width: DRAG_EDGE_ZONE_PX,
            background: `linear-gradient(to ${edge === 'left' ? 'right' : 'left'}, hsl(var(--primary) / 0.28), transparent)`,
          }}
        />
      ))}
      <TimelineDragScrollContext.Provider value={dragScrollController}>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          ref={scrollContainerRef}
          data-testid="timeline-scroll-container"
          data-tour="timeline-grid"
          data-timeline-scroll-owner="vertical"
          className={`flex-1 min-w-0 overflow-auto scrollbar-soft ${isDragScrolling ? 'cursor-grabbing' : 'cursor-grab'}${rangeShifting ? ' timeline-range-shifting' : ''}`}
          onScroll={handleScroll}
          onMouseDown={handleDragStart}
        >
          <div className="relative min-h-full" style={{ width: totalSurfaceWidth }}>
            {/* Milestone vertical lines overlay */}
            <div
              className="pointer-events-none absolute z-0 left-0"
              style={{ left: resolvedSidebarWidth, top: milestoneLineTop, width: totalWidth, height: milestoneLineHeight }}
            >
              {visibleMilestoneLines.map(({ date, color }) => {
                const lineIndex = visibleDayIndex.get(date);
                if (typeof lineIndex !== 'number') return null;
                const isHovered = milestoneLine?.date === date;
                const lineColor = hexToRgba(color, isHovered ? 1 : 0.6) ?? color;
                return (
                  <div
                    key={date}
                    // Only the hover look animates: a line whose `left` glided
                    // flew across the grid whenever the day range shifted.
                    className="absolute top-0 bottom-0 transition-[width,opacity,background-color] duration-200"
                    style={{
                      left: lineIndex * dayWidth + dayWidth / 2,
                      transform: 'translateX(-50%)',
                      width: isHovered ? milestoneLineHoverWidth : milestoneLineWidth,
                      backgroundColor: lineColor,
                      opacity: isHovered ? 1 : 0.7,
                    }}
                  />
                );
              })}
            </div>

            {/* Sticky header */}
            <div className="sticky top-0 z-20 bg-background">
              <div className="flex">
                <div
                  ref={sidebarContainerRef}
                  data-testid="timeline-sidebar-header"
                  data-timeline-sidebar="header"
                  className="sticky left-0 z-30 flex-shrink-0 bg-timeline-header border-r border-border"
                  style={{ width: resolvedSidebarWidth }}
                >
                  <div className="flex-shrink-0 border-b border-border" style={{ height: effectiveHeaderHeight }} />
                  <div
                    data-tour="milestones-row"
                    className="flex flex-shrink-0 items-center justify-center gap-1.5 border-b border-border px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{ height: milestoneRowHeight }}
                  >
                    <span aria-hidden="true" className="text-[11px] leading-none text-[hsl(16_58%_55%)]">◆</span>
                    {!isMobile && <span className="truncate">{t`Milestones`}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0" style={{ width: totalWidth }}>
                  <MilestoneLayer
                    totalWidth={totalWidth}
                    dayWidth={dayWidth}
                    isMobile={isMobile}
                    milestoneRowHeight={milestoneRowHeight}
                    milestoneHeaderRowTop={milestoneHeaderRowTop}
                    milestoneHeaderRowHeight={milestoneHeaderRowHeight}
                    milestoneTooltipCells={milestoneTooltipCells}
                    visibleDays={visibleDays}
                    projectById={projectById}
                    canEdit={canEdit}
                    dateLocale={dateLocale}
                    onEditMilestone={handleEditMilestone}
                    onCreateMilestone={canEdit ? handleCreateMilestone : noopCreateMilestone}
                    onHover={handleMilestoneHover}
                    onHoverEnd={handleMilestoneHoverEnd}
                  >
                    {timelineHeaderElement}
                  </MilestoneLayer>
                </div>
              </div>
            </div>

            {/* Timeline rows */}
            {displayRows.map((row, rowIndex) => (
              <div
                key={row.id}
                className="flex"
                data-tour={rowIndex === 0 ? 'timeline-first-row' : undefined}
              >
                <TimelineSidebarRow
                  row={row}
                  width={resolvedSidebarWidth}
                  isMobile={isMobile}
                  isMobileAssigneeTimeline={isMobileAssigneeTimeline}
                  sidebarViewportWidth={sidebarViewportWidth}
                  groupMode={groupMode}
                  getMonogram={getSidebarRowMonogram}
                  getAvatarInfo={getAssigneeAvatarInfo}
                  smallPhotos={!geometry.tieredAvatars}
                />
                <div
                  data-testid={`timeline-task-row-${row.id}`}
                  className="relative flex-shrink-0"
                  style={{ width: totalWidth }}
                >
                  <TimelineRow
                    rowId={row.id}
                    rowIndex={rowIndex}
                    visibleDays={visibleDays}
                    dayWidth={dayWidth}
                    viewMode={viewMode}
                    todayKey={todayKey}
                    holidayDates={holidayDates}
                    timeOffDays={timeOffIndex.daysByRowId.get(row.id)}
                    timeOffMotif={motifByRowId.get(row.id)}
                    height={row.height}
                    // Viewers too: double-click opens the dialog in time-off-only mode.
                    canEdit
                    canCreateTask={canEdit}
                    onCreateTask={handleCreateTaskAt}
                  >
                    {rowTaskElementsById.get(row.id)}
                  </TimelineRow>
                </div>
              </div>
            ))}

            {/* While searching, room under the last row so a match there can be
                scrolled up to the middle instead of sitting cut off at the edge. */}
            {searchActive && <div aria-hidden="true" className="h-[40vh]" />}

            {/* Пустой таймлайн иначе молчит: одна строка со своим именем и
                никакого намёка, что задача заводится двойным кликом по дню. */}
            {showEmptyHint && (
              <div
                className="pointer-events-none flex"
                data-testid="timeline-empty-hint"
              >
                <div className="flex-shrink-0" style={{ width: resolvedSidebarWidth }} />
                <div className="flex-shrink-0 px-6 py-8" style={{ width: totalWidth }}>
                  <div className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                    {canEdit
                      ? t`No tasks yet. Double-click any day to create one.`
                      : t`No tasks yet.`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </TimelineDragScrollContext.Provider>

      {!isMobile && sidebarViewportWidth > 0 && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize timeline sidebar"
          data-timeline-resize-handle
          className={`absolute inset-y-0 z-30 w-1 cursor-col-resize bg-transparent transition-colors ${isSidebarResizing ? 'bg-border/80' : 'hover:bg-border/70'}`}
          style={{ left: Math.max(0, sidebarViewportWidth - 2) }}
          onMouseDown={handleSidebarResizeStart}
          onDoubleClick={handleSidebarResizeReset}
        />
      )}

      {showTodayButton && <TimelineTodayButton isMobile={isMobile} onClick={handleJumpToToday} />}

      <TimeOffEditDialog
        recordId={editingTimeOffId}
        onOpenChange={(nextOpen) => { if (!nextOpen) setEditingTimeOffId(null); }}
      />

      <MilestoneDialog
        open={milestoneDialogOpen}
        onOpenChange={handleMilestoneDialogChange}
        date={milestoneDialogDate}
        milestone={editingMilestone}
        canEdit={canEdit}
      />
    </div>
  );
};
