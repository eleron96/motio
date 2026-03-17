import React, { useCallback, useMemo, useState, useRef } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { useAuthStore } from '@/features/auth/store/authStore';
import { TimelineHeader } from './TimelineHeader';
import { TimelineRow } from './TimelineRow';
import { TaskBar } from './TaskBar';
import { MilestoneDialog } from './MilestoneDialog';
import { MilestoneLayer } from './MilestoneLayer';
import { getVisibleDays, getDayWidth, getTaskPosition, SIDEBAR_WIDTH, HEADER_HEIGHT, MIN_ROW_HEIGHT, TASK_HEIGHT, TASK_GAP } from '@/features/planner/lib/dateUtils';
import { Milestone, ViewMode } from '@/features/planner/types/planner';
import {
  buildAssigneeGroupMap,
  buildTimelineDisplayRows,
  calculateTimelineRowHeights,
  groupTasksByTimelineRow,
  resolveCurrentUserAssigneeId,
  selectFilteredTasks,
  selectTimelineGroupItems,
  selectVisibleAssignees,
} from '@/features/planner/lib/timelineSelectors';
import {
  buildMilestoneTooltipCells,
  buildVisibleDayIndexMap,
  buildVisibleMilestoneLines,
  calculateMilestoneOffsets,
  filterMilestonesByProjects,
  groupMilestonesByDate,
  sortMilestonesByDateAndTitle,
} from '@/features/planner/lib/timelineMilestoneSelectors';
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
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';
import { UserAvatar } from '@/shared/ui/UserAvatar';
import { useDragScroll } from './hooks/useDragScroll';
import { useSidebarResize } from './hooks/useSidebarResize';
import { useTimelineViewport } from './hooks/useTimelineViewport';
import { useTimelineScroll, LEFT_CONTEXT_DAYS } from './hooks/useTimelineScroll';

/** Extra bottom gap on assignee rows in assignee grouping mode */
const ASSIGNEE_ROW_GAP = 20;
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
const TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MIN_WIDTH = 44;
const TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MAX_WIDTH = 56;
const TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_AUTO_MAX_WIDTH = 52;

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
  const user = useAuthStore((state) => state.user);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const workspaces = useAuthStore((state) => state.workspaces);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const members = useAuthStore((state) => state.members);
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
    : `clamp(${sidebarMinWidth}px, ${isMobileAssigneeTimeline ? '12vw' : isMobile ? '38vw' : '26vw'}, ${sidebarAutoMaxWidth}px)`;

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
  });

  // ─── Derived display values ────────────────────────────────────────────────

  const focusIndex = useMemo(() => {
    if (!viewportWidth || dayWidth === 0) return -1;
    const focusPx = scrollLeft + LEFT_CONTEXT_DAYS * dayWidth + dayWidth / 2;
    return Math.min(visibleDays.length - 1, Math.max(0, Math.floor(focusPx / dayWidth)));
  }, [scrollLeft, viewportWidth, dayWidth, visibleDays.length]);

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

  // ─── Milestone state ───────────────────────────────────────────────────────

  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneDialogDate, setMilestoneDialogDate] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneLine, setMilestoneLine] = useState<{
    date: string;
    color: string;
    visible: boolean;
  } | null>(null);
  const milestoneRowHeight = 24;

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const filteredMilestones = useMemo(
    () => filterMilestonesByProjects(milestones, filters.projectIds),
    [milestones, filters.projectIds],
  );

  const sortedMilestones = useMemo(
    () => sortMilestonesByDateAndTitle(filteredMilestones),
    [filteredMilestones],
  );

  const visibleDayIndex = useMemo(
    () => buildVisibleDayIndexMap(visibleDays),
    [visibleDays],
  );

  const milestonesByDate = useMemo(
    () => groupMilestonesByDate(sortedMilestones),
    [sortedMilestones],
  );

  const milestoneOffsets = useMemo(
    () => calculateMilestoneOffsets(milestonesByDate),
    [milestonesByDate],
  );

  const visibleMilestoneLines = useMemo(
    () => buildVisibleMilestoneLines({
      milestones: sortedMilestones,
      visibleDayIndex,
      projectById,
      defaultColor: DEFAULT_NEUTRAL_COLOR,
    }),
    [projectById, sortedMilestones, visibleDayIndex],
  );

  const milestoneTooltipCells = useMemo(
    () => buildMilestoneTooltipCells({
      milestonesByDate,
      visibleDayIndex,
      projectById,
      defaultColor: DEFAULT_NEUTRAL_COLOR,
    }),
    [milestonesByDate, projectById, visibleDayIndex],
  );

  const milestoneDotRadius = 5;
  const milestoneLineTop = HEADER_HEIGHT + milestoneRowHeight / 2 + milestoneDotRadius;
  const milestoneLineHeight = `calc(100% - ${milestoneLineTop}px)`;
  const milestoneLineWidth = 3;
  const milestoneLineHoverWidth = 4;
  const milestoneHeaderRowTop = 40;
  const milestoneHeaderRowHeight = HEADER_HEIGHT - milestoneHeaderRowTop;

  // ─── Milestone handlers ────────────────────────────────────────────────────

  const handleMilestoneDialogChange = useCallback((open: boolean) => {
    setMilestoneDialogOpen(open);
    if (!open) {
      setMilestoneDialogDate(null);
      setEditingMilestone(null);
    }
  }, []);

  const handleCreateMilestone = useCallback((date: string) => {
    setEditingMilestone(null);
    setMilestoneDialogDate(date);
    setMilestoneDialogOpen(true);
  }, []);

  const handleEditMilestone = useCallback((milestone: Milestone) => {
    setEditingMilestone(milestone);
    setMilestoneDialogDate(null);
    setMilestoneDialogOpen(true);
  }, []);

  const handleMilestoneHover = useCallback((date: string, color: string) => {
    setMilestoneLine({ date, color, visible: true });
  }, []);

  const handleMilestoneHoverEnd = useCallback(() => {
    setMilestoneLine(null);
  }, []);

  // ─── Task display ──────────────────────────────────────────────────────────

  const filteredTasks = useMemo(
    () => selectFilteredTasks(tasks, filters, assigneeGroupMap, assignees),
    [tasks, filters, assigneeGroupMap, assignees],
  );

  const visibleAssignees = useMemo(
    () => selectVisibleAssignees({
      groupMode,
      filteredAssignees: activeFilteredAssignees,
      filters,
      assigneeGroupMap,
    }),
    [activeFilteredAssignees, assigneeGroupMap, filters, groupMode],
  );

  const groupItems = useMemo(
    () => selectTimelineGroupItems({
      groupMode,
      visibleAssignees,
      projects,
      myAssigneeId,
    }),
    [groupMode, visibleAssignees, projects, myAssigneeId],
  );

  const tasksByRow = useMemo(
    () => groupTasksByTimelineRow({
      filteredTasks,
      groupItems,
      groupMode,
    }),
    [filteredTasks, groupItems, groupMode],
  );

  const rowHeights = useMemo(
    () => calculateTimelineRowHeights(tasksByRow, {
      minRowHeight: MIN_ROW_HEIGHT,
      taskHeight: TASK_HEIGHT,
      taskGap: TASK_GAP,
    }),
    [tasksByRow],
  );

  const displayRows = useMemo(
    () => buildTimelineDisplayRows({
      groupItems,
      tasksByRow,
      rowHeights,
      groupMode,
      assigneeFilterCount: filters.assigneeIds.length,
      hideUnassigned: filters.hideUnassigned,
      labels: {
        unassigned: t`Unassigned`,
        noProject: t`No project`,
      },
      minRowHeight: MIN_ROW_HEIGHT,
      assigneeRowGap: ASSIGNEE_ROW_GAP,
    }),
    [filters.assigneeIds.length, filters.hideUnassigned, groupItems, groupMode, rowHeights, tasksByRow],
  );

  const rowTaskElementsById = useMemo(() => {
    const elementsByRowId = new Map<string, React.ReactNode[]>();
    displayRows.forEach((row) => {
      const rowAssigneeId = groupMode === 'assignee' && row.id !== 'unassigned' ? row.id : null;
      const taskElements: React.ReactNode[] = [];
      row.tasks.forEach((task) => {
        const position = getTaskPosition(
          task.startDate,
          task.endDate,
          visibleDays,
          dayWidth,
        );
        if (!position) return;
        taskElements.push(
          <TaskBar
            key={task.id}
            task={task}
            position={position}
            dayWidth={dayWidth}
            visibleDays={visibleDays}
            lane={task.lane}
            canEdit={canEdit}
            rowAssigneeId={rowAssigneeId}
          />,
        );
      });
      elementsByRowId.set(row.id, taskElements);
    });
    return elementsByRowId;
  }, [canEdit, dayWidth, displayRows, groupMode, visibleDays]);

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
    if (!canEdit) return;
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

  const getSidebarRowMonogram = useCallback((rowName: string) => getPersonMonogram(rowName, 'U'), []);

  const getAssigneeAvatarInfo = useCallback((rowId: string): { avatarUrl: string | null; userId: string } => {
    const assignee = assignees.find((a) => a.id === rowId);
    const userId = assignee?.userId ?? rowId;
    const member = members.find((m) => m.userId === userId);
    return { avatarUrl: member?.avatarUrl ?? null, userId };
  }, [assignees, members]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={cn(
      'relative flex flex-col h-full overflow-hidden bg-background',
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
                  <div className="flex-shrink-0 border-b border-border" style={{ height: HEADER_HEIGHT }} />
                  <div className="flex-shrink-0 border-b border-border" style={{ height: milestoneRowHeight }} />
                </div>
                <div className="flex-shrink-0" style={{ width: totalWidth }}>
                  <MilestoneLayer
                    totalWidth={totalWidth}
                    dayWidth={dayWidth}
                    milestoneRowHeight={milestoneRowHeight}
                    milestoneHeaderRowTop={milestoneHeaderRowTop}
                    milestoneHeaderRowHeight={milestoneHeaderRowHeight}
                    milestoneTooltipCells={milestoneTooltipCells}
                    sortedMilestones={sortedMilestones}
                    milestonesByDate={milestonesByDate}
                    milestoneOffsets={milestoneOffsets}
                    visibleDayIndex={visibleDayIndex}
                    visibleDays={visibleDays}
                    projectById={projectById}
                    milestoneLine={milestoneLine}
                    canEdit={canEdit}
                    dateLocale={dateLocale}
                    onEditMilestone={handleEditMilestone}
                    onCreateMilestone={canEdit ? handleCreateMilestone : () => {}}
                    onHover={handleMilestoneHover}
                    onHoverEnd={handleMilestoneHoverEnd}
                  >
                    <TimelineHeader
                      visibleDays={visibleDays}
                      dayWidth={dayWidth}
                      viewMode={viewMode}
                      scrollLeft={scrollLeft}
                      viewportWidth={viewportWidth}
                      attentionDate={timelineAttentionDate}
                      todayKey={todayKey}
                      holidayDates={holidayDates}
                      onDateContextAction={canEdit ? handleCreateMilestone : undefined}
                    />
                  </MilestoneLayer>
                </div>
              </div>
            </div>

            {/* Timeline rows */}
            {displayRows.map((row, rowIndex) => (
              <div key={row.id} className="flex">
                <div
                  data-testid={`timeline-sidebar-row-${row.id}`}
                  data-timeline-sidebar="row"
                  className="sticky left-0 z-10 flex-shrink-0 border-r border-border bg-timeline-header"
                  style={{ width: resolvedSidebarWidth, height: row.height }}
                >
                  <div
                    className={cn(
                      'flex h-full items-center gap-2 border-b border-border transition-colors box-border hover:bg-timeline-row-hover',
                      isMobileAssigneeTimeline ? 'justify-center px-1.5' : isMobile ? 'px-3' : 'px-4',
                    )}
                  >
                    <div className={cn(
                      'min-w-0 flex flex-1 items-center gap-3',
                      isMobileAssigneeTimeline && 'justify-center',
                    )}>
                      {row.color && (
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                      )}
                      {isMobileAssigneeTimeline ? (
                        <UserAvatar
                          size="sm"
                          initials={getSidebarRowMonogram(row.name)}
                          avatarUrl={groupMode === 'assignee' ? getAssigneeAvatarInfo(row.id).avatarUrl : null}
                          colorSeed={groupMode === 'assignee' ? getAssigneeAvatarInfo(row.id).userId : row.id}
                          showInitialsOverlay
                          className="border border-border flex-shrink-0"
                        />
                      ) : (
                        <>
                          {groupMode === 'assignee' && row.id !== 'unassigned' && (() => {
                            const { avatarUrl, userId } = getAssigneeAvatarInfo(row.id);
                            return (
                              <UserAvatar
                                size="xs"
                                initials={getSidebarRowMonogram(row.name)}
                                avatarUrl={avatarUrl}
                                colorSeed={userId}
                                showInitialsOverlay
                                className="flex-shrink-0"
                              />
                            );
                          })()}
                          <span
                            className={cn(
                              'min-w-0 font-medium text-foreground whitespace-normal break-words [overflow-wrap:anywhere]',
                              isMobile && groupMode === 'assignee'
                                ? 'text-xs leading-5 line-clamp-1'
                                : 'text-sm leading-snug line-clamp-2',
                            )}
                            title={row.name}
                          >
                            {row.name}
                          </span>
                        </>
                      )}
                    </div>
                    {groupMode === 'project' && (
                      <span className="shrink-0 pl-2 text-xs text-muted-foreground">
                        {row.tasks.length}
                      </span>
                    )}
                  </div>
                </div>
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
                    height={row.height}
                    canEdit={canEdit}
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
          className="absolute bottom-6 right-6 z-30 border border-border/80 bg-background/95 text-foreground shadow-[0_14px_34px_rgba(15,23,42,0.35)] backdrop-blur transition-shadow hover:shadow-[0_18px_40px_rgba(15,23,42,0.45)]"
          onClick={handleJumpToToday}
        >
          {t`Today`}
        </Button>
      )}

      <MilestoneDialog
        open={milestoneDialogOpen}
        onOpenChange={handleMilestoneDialogChange}
        date={milestoneDialogDate}
        milestone={editingMilestone}
        canEdit={canEdit}
        allowDateEdit={Boolean(editingMilestone)}
      />
    </div>
  );
};
