import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { useAuthStore } from '@/features/auth/store/authStore';
import { TimelineHeader } from './TimelineHeader';
import { TimelineRow } from './TimelineRow';
import { MilestoneDialog } from './MilestoneDialog';
import { TimeOffEditDialog } from './TimeOffEditDialog';
import { MilestoneLayer } from './MilestoneLayer';
import { getVisibleDays, getDayWidth, SIDEBAR_WIDTH } from '@/features/planner/lib/dateUtils';
import { ViewMode } from '@/features/planner/types/planner';
import { buildTimeOffIndex, EMPTY_TIME_OFF_INDEX, NO_TIME_OFF } from '@/features/planner/lib/timeOff';
import { resolveRowMotif, type TimeOffMotifId } from '@/features/planner/lib/timeOffMotifs';
import { isTimeOffEnabled } from '@/shared/lib/featureFlags';
import {
  buildAssigneeGroupMap,
  resolveCurrentUserAssigneeId,
} from '@/features/planner/lib/timelineSelectors';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { format, parseISO } from 'date-fns';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import { normalizeHolidayCountryCode, useHolidayMap } from '@/features/planner/hooks/useHolidayMap';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { getPersonMonogram } from '@/shared/domain/personName';
import { usePersonColors } from '@/features/planner/hooks/usePersonColors';
import { useDragScroll } from './hooks/useDragScroll';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useTimelineViewport } from './hooks/useTimelineViewport';
import { useTimelineScroll, LEFT_CONTEXT_DAYS } from './hooks/useTimelineScroll';
import { useMilestoneDisplay } from './hooks/useMilestoneDisplay';
import { useTaskDisplayRows } from './hooks/useTaskDisplayRows';
import { TimelineSidebarRow } from './TimelineSidebarRow';

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
const TIMELINE_SIDEBAR_MIN_WIDTH = SIDEBAR_WIDTH;
const TIMELINE_SIDEBAR_MAX_WIDTH = 520;
const TIMELINE_SIDEBAR_AUTO_MAX_WIDTH = 360;
const TIMELINE_MOBILE_PROJECT_SIDEBAR_MIN_WIDTH = 120;
const TIMELINE_MOBILE_PROJECT_SIDEBAR_MAX_WIDTH = 164;
const TIMELINE_MOBILE_PROJECT_SIDEBAR_AUTO_MAX_WIDTH = 152;
const TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MIN_WIDTH = 48;
const TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MAX_WIDTH = 64;
const TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_AUTO_MAX_WIDTH = 56;

interface TimelineGridProps {
  onCreateTask?: (payload: {
    startDate: string;
    endDate: string;
    projectId?: string | null;
    assigneeIds?: string[];
  }) => void;
  sidebarWidth?: number | null;
  onSidebarWidthChange?: (width: number) => void;
  onSidebarWidthReset?: () => void;
}

const clampTimelineSidebarWidth = (
  value: number,
  minWidth: number,
  maxWidth: number,
) => (
  Math.max(minWidth, Math.min(maxWidth, value))
);

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
  const tasks = usePlannerStore((state) => state.tasks);
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

  const isMobileAssigneeTimeline = isMobile && groupMode === 'assignee';
  const sidebarMinWidth = isMobile
    ? (groupMode === 'assignee' ? TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MIN_WIDTH : TIMELINE_MOBILE_PROJECT_SIDEBAR_MIN_WIDTH)
    : TIMELINE_SIDEBAR_MIN_WIDTH;
  const sidebarMaxWidth = isMobile
    ? (groupMode === 'assignee' ? TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MAX_WIDTH : TIMELINE_MOBILE_PROJECT_SIDEBAR_MAX_WIDTH)
    : TIMELINE_SIDEBAR_MAX_WIDTH;
  const sidebarAutoMaxWidth = isMobile
    ? (groupMode === 'assignee' ? TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_AUTO_MAX_WIDTH : TIMELINE_MOBILE_PROJECT_SIDEBAR_AUTO_MAX_WIDTH)
    : TIMELINE_SIDEBAR_AUTO_MAX_WIDTH;
  const resolvedSidebarWidth = typeof sidebarWidth === 'number' && Number.isFinite(sidebarWidth)
    ? `${clampTimelineSidebarWidth(sidebarWidth, sidebarMinWidth, sidebarMaxWidth)}px`
    : `clamp(${sidebarMinWidth}px, ${isMobileAssigneeTimeline ? '14vw' : isMobile ? '38vw' : '26vw'}, ${sidebarAutoMaxWidth}px)`;

  const visibleDays = useMemo(() => getVisibleDays(currentDate, viewMode), [currentDate, viewMode]);
  const visibleHolidayYears = useMemo(
    () => Array.from(new Set(visibleDays.map((day) => day.getFullYear()))),
    [visibleDays],
  );
  const holidayCountryCode = useMemo(() => {
    const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
    return normalizeHolidayCountryCode(currentWorkspace?.holidayCountry);
  }, [workspaces, currentWorkspaceId]);
  const { holidayDates } = useHolidayMap({
    years: visibleHolidayYears,
    holidayCountryCode,
    fallbackHolidayLabel: t`Non-working day`,
    holidayLabel: t`Holiday`,
  });
  // Time-off records of the visible window, grouped by row. Assignee grouping
  // only: project rows have no person, so there is nothing to shade there.
  const timeOffIndex = useMemo(
    () => (isTimeOffEnabled() && groupMode === 'assignee'
      ? buildTimeOffIndex(timeOff, visibleDays, timeOffDragPreview)
      : EMPTY_TIME_OFF_INDEX),
    [groupMode, timeOff, timeOffDragPreview, visibleDays],
  );

  // Decorative motif per row. Mine comes from the live preference so the settings
  // picker repaints my row at once; a teammate's rides along on their assignee
  // record. Only rows that actually carry time off get an entry — every other row
  // stays attribute-less and unchanged.
  const motifByRowId = useMemo(() => {
    const motifs = new Map<string, TimeOffMotifId>();
    if (timeOffIndex.byRowId.size === 0) return motifs;
    const motifByAssigneeId = new Map(
      assignees.map((assignee) => [assignee.id, assignee.timeOffMotif]),
    );
    timeOffIndex.byRowId.forEach((_records, rowId) => {
      motifs.set(rowId, resolveRowMotif({
        isMe: rowId === myAssigneeId,
        myPreferences: myProfilePreferences,
        assigneeMotif: motifByAssigneeId.get(rowId),
      }));
    });
    return motifs;
  }, [assignees, myAssigneeId, myProfilePreferences, timeOffIndex]);

  const dayWidth = useMemo(() => getDayWidth(viewMode), [viewMode]);
  const totalWidth = visibleDays.length * dayWidth;
  const totalSurfaceWidth = `calc(${resolvedSidebarWidth} + ${totalWidth}px)`;
  const scrollReanchorMinShiftDays = SCROLL_REANCHOR_MIN_SHIFT_DAYS[viewMode];
  const scrollReanchorEdgeTriggerDays = SCROLL_REANCHOR_EDGE_TRIGGER_DAYS[viewMode];
  const currentDateObj = useMemo(() => parseISO(currentDate), [currentDate]);

  // ─── Custom hooks ─────────────────────────────────────────────────────────

  const { isDragScrolling, lastDragTimeRef, handleDragStart } = useDragScroll({ markTimelineInteraction });

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
    highlightedTaskId,
    highlightedTaskRowAssigneeId,
    tasksLength: tasks.length,
    scrollTargetDate,
    scrollRequestId,
    scrollReanchorMinShiftDays,
    scrollReanchorEdgeTriggerDays,
    setCurrentDate,
    markTimelineInteraction,
    isDragScrolling,
    leftContextDays,
  });

  // ─── Derived display values ────────────────────────────────────────────────

  const focusIndex = useMemo(() => {
    if (!viewportWidth || dayWidth === 0) return -1;
    const focusPx = scrollLeft + leftContextDays * dayWidth + dayWidth / 2;
    return Math.min(visibleDays.length - 1, Math.max(0, Math.floor(focusPx / dayWidth)));
  }, [scrollLeft, viewportWidth, dayWidth, visibleDays.length, leftContextDays]);

  useEffect(() => {
    if (focusIndex >= 0 && focusIndex < visibleDays.length) {
      setVisibleCenterDate(format(visibleDays[focusIndex], 'yyyy-MM-dd'));
    }
  }, [focusIndex, visibleDays, setVisibleCenterDate]);

  const showTodayButton = useMemo(() => {
    if (!viewportWidth || dayWidth === 0 || visibleDays.length === 0) return false;
    const todayIndex = visibleDays.findIndex((day) => format(day, 'yyyy-MM-dd') === todayKey);
    if (todayIndex < 0) return true;
    const todayStart = todayIndex * dayWidth;
    const todayEnd = todayStart + dayWidth;
    const viewportStart = scrollLeft;
    const viewportEnd = scrollLeft + viewportWidth;
    return todayEnd <= viewportStart || todayStart >= viewportEnd;
  }, [dayWidth, scrollLeft, todayKey, viewportWidth, visibleDays]);

  // ─── Milestone state, selectors, and handlers ─────────────────────────────

  const {
    milestoneDialogOpen,
    milestoneDialogDate,
    editingMilestone,
    milestoneLine,
    projectById,
    sortedMilestones,
    visibleDayIndex,
    milestonesByDate,
    milestoneOffsets,
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
  });

  // ─── Task display ──────────────────────────────────────────────────────────

  const { displayRows, rowTaskElementsById } = useTaskDisplayRows({
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

  const handleCreateTaskAt = useCallback((date: string, rowId: string) => {
    // Viewers may open the dialog too — it opens in time-off-only mode for them.
    if (!canEdit && !isTimeOffEnabled()) return;
    if (Date.now() - lastDragTimeRef.current < 200) return;
    const defaults: {
      startDate: string;
      endDate: string;
      projectId?: string | null;
      assigneeIds?: string[];
    } = {
      startDate: date,
      endDate: date,
      assigneeIds: [],
    };

    if (groupMode === 'project') {
      if (rowId === 'unassigned') {
        defaults.projectId = null;
      } else {
        const project = projects.find((item) => item.id === rowId);
        defaults.projectId = project && !project.archived ? project.id : null;
      }
    }

    if (groupMode === 'assignee' && rowId !== 'unassigned') {
      const assignee = assignees.find((item) => item.id === rowId);
      if (assignee?.isActive) {
        defaults.assigneeIds = [assignee.id];
      }
    }

    onCreateTask?.(defaults);
  }, [assignees, canEdit, groupMode, lastDragTimeRef, onCreateTask, projects]);

  const personColors = usePersonColors();

  const getSidebarRowMonogram = useCallback((rowName: string) => getPersonMonogram(rowName, 'U'), []);

  const getAssigneeAvatarInfo = useCallback((rowId: string): {
    avatarUrl: string | null;
    userId: string;
    email: string | null;
    color: string | null;
  } => {
    const assignee = assignees.find((a) => a.id === rowId);
    const userId = assignee?.userId ?? rowId;
    const member = members.find((m) => m.userId === userId);
    // Workspace profile email wins; assignees without an account (external
    // people) fall back to the contact email stored on the assignee itself.
    return {
      avatarUrl: member?.avatarUrl ?? null,
      userId,
      email: member?.email ?? assignee?.email ?? null,
      // The colour in effect, not just a hand-picked one: an avatar has to match
      // the person's day-off circles and chart series either way.
      color: personColors.byAssigneeId.get(rowId) ?? null,
    };
  }, [assignees, members, personColors]);

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
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          ref={scrollContainerRef}
          data-testid="timeline-scroll-container"
          data-tour="timeline-grid"
          data-timeline-scroll-owner="vertical"
          className={`flex-1 min-w-0 overflow-auto scrollbar-soft ${isDragScrolling ? 'cursor-grabbing' : 'cursor-grab'}`}
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
                    className="absolute top-0 bottom-0 transition-all duration-200"
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
              <div key={row.id} className="flex">
                <TimelineSidebarRow
                  row={row}
                  width={resolvedSidebarWidth}
                  isMobile={isMobile}
                  isMobileAssigneeTimeline={isMobileAssigneeTimeline}
                  sidebarViewportWidth={sidebarViewportWidth}
                  groupMode={groupMode}
                  getMonogram={getSidebarRowMonogram}
                  getAvatarInfo={getAssigneeAvatarInfo}
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
                    canEdit={canEdit || isTimeOffEnabled()}
                    canCreateTask={canEdit}
                    onCreateTask={handleCreateTaskAt}
                  >
                    {rowTaskElementsById.get(row.id)}
                  </TimelineRow>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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

      {showTodayButton && (
        <Button
          type="button"
          variant="secondary"
          className={cn(
            'absolute z-30 border border-border/80 bg-background/95 text-foreground shadow-[0_14px_34px_rgba(15,23,42,0.35)] backdrop-blur transition-shadow hover:shadow-[0_18px_40px_rgba(15,23,42,0.45)]',
            // On mobile the add-task FAB sits bottom-right, so stack "Today"
            // above it (same right edge) instead of overlapping it.
            isMobile
              ? 'right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+5.75rem)]'
              : 'bottom-6 right-6',
          )}
          onClick={handleJumpToToday}
        >
          {t`Today`}
        </Button>
      )}

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
