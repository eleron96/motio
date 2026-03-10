import React, { startTransition, useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { useAuthStore } from '@/features/auth/store/authStore';
import { TimelineHeader } from './TimelineHeader';
import { TimelineRow } from './TimelineRow';
import { TaskBar } from './TaskBar';
import { MilestoneDialog } from './MilestoneDialog';
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
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { differenceInDays, format, isSameDay, parseISO } from 'date-fns';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import { normalizeHolidayCountryCode, useHolidayMap } from '@/features/planner/hooks/useHolidayMap';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { getPersonMonogram } from '@/shared/domain/personName';

/** Дополнительный отступ снизу у строки пользователя в режиме группировки по исполнителям (визуально больше расстояние между пользователями) */
const ASSIGNEE_ROW_GAP = 20;
/** Показываем 2 полных дня слева от фокусной даты, остальное пространство оставляем под будущие дни. */
const LEFT_CONTEXT_DAYS = 2;
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
const EDGE_REANCHOR_COOLDOWN_MS = 450;
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
  const timelineAttentionDate = usePlannerStore((state) => state.timelineAttentionDate);
  const setTimelineAttentionDate = usePlannerStore((state) => state.setTimelineAttentionDate);
  const markTimelineInteraction = usePlannerStore((state) => state.markTimelineInteraction);
  const user = useAuthStore((state) => state.user);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const workspaces = useAuthStore((state) => state.workspaces);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
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
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const dragScrollRef = useRef<{
    startX: number;
    startScrollLeft: number;
    target: HTMLDivElement | null;
    didMove: boolean;
  } | null>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const pendingDragClientXRef = useRef<number | null>(null);
  const lastDragTimeRef = useRef(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const lastRenderedFocusIndexRef = useRef(-1);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const pendingScrollLeftRef = useRef<number | null>(null);
  const [isDragScrolling, setIsDragScrolling] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [sidebarViewportWidth, setSidebarViewportWidth] = useState(0);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneDialogDate, setMilestoneDialogDate] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneLine, setMilestoneLine] = useState<{
    date: string;
    color: string;
    visible: boolean;
  } | null>(null);
  const milestoneRowHeight = 24;
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
  const focusIndex = useMemo(() => {
    if (!viewportWidth || dayWidth === 0) return -1;
    const focusPx = scrollLeft + LEFT_CONTEXT_DAYS * dayWidth + dayWidth / 2;
    return Math.min(visibleDays.length - 1, Math.max(0, Math.floor(focusPx / dayWidth)));
  }, [scrollLeft, viewportWidth, dayWidth, visibleDays.length]);
  useEffect(() => {
    lastRenderedFocusIndexRef.current = focusIndex;
  }, [focusIndex]);
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
  const scrollEndTimerRef = useRef<number | null>(null);
  const highlightedTaskScrollTimerRef = useRef<number | null>(null);
  const pendingScrollDateRef = useRef<string | null>(null);
  const lastEdgeReanchorAtRef = useRef(0);
  const visibleDaysRef = useRef<Date[]>([]);
  const ignoreScrollDateUpdateRef = useRef(false);
  const skipAutoCenterRef = useRef(false);
  const prevRangeRef = useRef<{ start: Date | null; viewMode: string } | null>(null);
  const milestoneHeaderMenuTriggerRefs = useRef(new Map<string, HTMLButtonElement>());

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
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
  
  // Timeline uses one shared scroll surface: scrollLeft drives the right grid,
  // while native vertical scroll moves sidebar rows and task rows together.
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    markTimelineInteraction(700);
    const newScrollLeft = e.currentTarget.scrollLeft;
    pendingScrollLeftRef.current = newScrollLeft;
    let nextFocusIndex = -1;
    if (visibleDays.length > 0 && dayWidth > 0) {
      const focusPx = newScrollLeft + LEFT_CONTEXT_DAYS * dayWidth + dayWidth / 2;
      nextFocusIndex = Math.min(
        visibleDays.length - 1,
        Math.max(0, Math.floor(focusPx / dayWidth)),
      );
    }
    const shouldUpdateScrollState = nextFocusIndex < 0 || nextFocusIndex !== lastRenderedFocusIndexRef.current;
    if (nextFocusIndex >= 0) {
      lastRenderedFocusIndexRef.current = nextFocusIndex;
    }
    if (shouldUpdateScrollState && scrollSyncFrameRef.current === null) {
      scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
        scrollSyncFrameRef.current = null;
        const pending = pendingScrollLeftRef.current;
        if (pending !== null) {
          setScrollLeft((prev) => (prev === pending ? prev : pending));
        }
      });
    }

    if (ignoreScrollDateUpdateRef.current) {
      return;
    }

    if (nextFocusIndex >= 0) {
      const date = format(visibleDays[nextFocusIndex], 'yyyy-MM-dd');
      pendingScrollDateRef.current = date;
      if (scrollEndTimerRef.current) {
        window.clearTimeout(scrollEndTimerRef.current);
      }
      scrollEndTimerRef.current = window.setTimeout(() => {
        const latestScrollLeft = pendingScrollLeftRef.current;
        if (typeof latestScrollLeft === 'number') {
          setScrollLeft((prev) => (prev === latestScrollLeft ? prev : latestScrollLeft));
        }
        const nextDate = pendingScrollDateRef.current;
        const container = scrollContainerRef.current;
        if (nextDate && nextDate !== currentDate && container) {
          const now = Date.now();
          if (now - lastEdgeReanchorAtRef.current < EDGE_REANCHOR_COOLDOWN_MS) {
            return;
          }
          const resolvedScrollLeft = typeof latestScrollLeft === 'number'
            ? latestScrollLeft
            : container.scrollLeft;
          const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
          const edgeThresholdPx = Math.max(dayWidth * scrollReanchorEdgeTriggerDays, dayWidth * LEFT_CONTEXT_DAYS);
          const nearLeftEdge = resolvedScrollLeft <= edgeThresholdPx;
          const nearRightEdge = (maxScroll - resolvedScrollLeft) <= edgeThresholdPx;
          // Re-anchor only when user approaches either edge of the visible window.
          if (nearLeftEdge || nearRightEdge) {
            const daysDelta = Math.abs(differenceInDays(parseISO(nextDate), parseISO(currentDate)));
            if (daysDelta >= scrollReanchorMinShiftDays) {
              lastEdgeReanchorAtRef.current = now;
              skipAutoCenterRef.current = true;
              startTransition(() => {
                setCurrentDate(nextDate);
              });
            }
          }
        }
      }, 450);
    }
  }, [currentDate, dayWidth, markTimelineInteraction, scrollReanchorEdgeTriggerDays, scrollReanchorMinShiftDays, setCurrentDate, visibleDays]);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (
      target instanceof Element
      && target.closest('.task-bar, .milestone-dot, .milestone-cell, [data-timeline-sidebar], [data-timeline-resize-handle]')
    ) {
      return;
    }
    dragScrollRef.current = {
      startX: e.clientX,
      startScrollLeft: e.currentTarget.scrollLeft,
      target: e.currentTarget,
      didMove: false,
    };
    pendingDragClientXRef.current = e.clientX;
    markTimelineInteraction(900);
    setIsDragScrolling(true);
    e.preventDefault();
  }, [markTimelineInteraction]);

  useEffect(() => {
    if (!isDragScrolling) return;

    const prevBodyCursor = document.body.style.cursor;
    const prevBodyUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const flushDragScroll = () => {
      dragScrollFrameRef.current = null;
      const state = dragScrollRef.current;
      const pointerX = pendingDragClientXRef.current;
      if (!state?.target || typeof pointerX !== 'number') return;
      const deltaX = pointerX - state.startX;
      if (!state.didMove && Math.abs(deltaX) > 4) {
        state.didMove = true;
      }
      state.target.scrollLeft = state.startScrollLeft - deltaX;
    };

    const scheduleDragScroll = () => {
      if (dragScrollFrameRef.current !== null) return;
      dragScrollFrameRef.current = window.requestAnimationFrame(flushDragScroll);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const state = dragScrollRef.current;
      if (!state?.target) return;
      pendingDragClientXRef.current = e.clientX;
      scheduleDragScroll();
    };

    const handleMouseUp = () => {
      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
        dragScrollFrameRef.current = null;
      }
      if (dragScrollRef.current?.didMove) {
        lastDragTimeRef.current = Date.now();
      }
      dragScrollRef.current = null;
      pendingDragClientXRef.current = null;
      setIsDragScrolling(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
        dragScrollFrameRef.current = null;
      }
      document.body.style.cursor = prevBodyCursor;
      document.body.style.userSelect = prevBodyUserSelect;
    };
  }, [isDragScrolling]);

  useEffect(() => {
    if (!isSidebarResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = sidebarResizeRef.current;
      if (!resizeState || !onSidebarWidthChange) return;
      const deltaX = event.clientX - resizeState.startX;
      onSidebarWidthChange(
        clampTimelineSidebarWidth(resizeState.startWidth + deltaX, sidebarMinWidth, sidebarMaxWidth),
      );
    };

    const handleMouseUp = () => {
      sidebarResizeRef.current = null;
      setIsSidebarResizing(false);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [isSidebarResizing, onSidebarWidthChange, sidebarMaxWidth, sidebarMinWidth]);

  const handleSidebarResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSidebarWidthChange) return;
    const currentWidth = sidebarContainerRef.current?.getBoundingClientRect().width ?? sidebarMinWidth;
    sidebarResizeRef.current = { startX: event.clientX, startWidth: currentWidth };
    setIsSidebarResizing(true);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    event.preventDefault();
  }, [onSidebarWidthChange, sidebarMinWidth]);

  const handleSidebarResizeReset = useCallback(() => {
    onSidebarWidthReset?.();
  }, [onSidebarWidthReset]);

  useEffect(() => () => {
    if (scrollEndTimerRef.current) {
      window.clearTimeout(scrollEndTimerRef.current);
    }
    if (highlightedTaskScrollTimerRef.current) {
      window.clearTimeout(highlightedTaskScrollTimerRef.current);
    }
    if (scrollSyncFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollSyncFrameRef.current);
    }
    if (dragScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragScrollFrameRef.current);
      dragScrollFrameRef.current = null;
    }
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    const targetScroll = Math.min(
      maxScroll,
      Math.max(0, (index - LEFT_CONTEXT_DAYS) * dayWidth),
    );
    container.scrollLeft = targetScroll;
    pendingScrollLeftRef.current = targetScroll;
    lastRenderedFocusIndexRef.current = index;
    setScrollLeft(targetScroll);
  }, [dayWidth]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;

    const updateDimensions = () => {
      const measuredSidebarWidth = sidebarContainerRef.current?.getBoundingClientRect().width ?? 0;
      setSidebarViewportWidth((prev) => (prev === measuredSidebarWidth ? prev : measuredSidebarWidth));
      const nextViewportWidth = Math.max(0, container.clientWidth - measuredSidebarWidth);
      setViewportWidth((prev) => (prev === nextViewportWidth ? prev : nextViewportWidth));
    };

    updateDimensions();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateDimensions);
      observer.observe(container);
      if (sidebarContainerRef.current) {
        observer.observe(sidebarContainerRef.current);
      }
      return () => observer.disconnect();
    }
    return undefined;
  }, [resolvedSidebarWidth]);

  const lastCenteredRef = useRef<{ date: string; viewMode: string } | null>(null);

  useEffect(() => {
    visibleDaysRef.current = visibleDays;
  }, [visibleDays]);

  useEffect(() => {
    if (visibleDays.length === 0 || dayWidth === 0) {
      prevRangeRef.current = { start: visibleDays[0] ?? null, viewMode };
      return;
    }

    const previous = prevRangeRef.current;
    const nextStart = visibleDays[0];

    if (
      previous?.start
      && previous.viewMode === viewMode
    ) {
      const deltaDays = differenceInDays(nextStart, previous.start);
      if (deltaDays !== 0) {
        const shiftPx = deltaDays * dayWidth;
        const container = scrollContainerRef.current;
        if (container) {
          const nextScrollLeft = Math.max(0, container.scrollLeft - shiftPx);
          ignoreScrollDateUpdateRef.current = true;
          container.scrollLeft = nextScrollLeft;
          setScrollLeft(nextScrollLeft);
          requestAnimationFrame(() => {
            ignoreScrollDateUpdateRef.current = false;
          });
        }
      }
    }

    prevRangeRef.current = { start: nextStart, viewMode };
  }, [dayWidth, viewMode, visibleDays]);

  // Center scroll when the active date or view changes (not when tasks change)
  useEffect(() => {
    if (lastCenteredRef.current?.date === currentDate && lastCenteredRef.current?.viewMode === viewMode) {
      return;
    }
    if (skipAutoCenterRef.current) {
      skipAutoCenterRef.current = false;
      lastCenteredRef.current = { date: currentDate, viewMode };
      return;
    }
    const days = visibleDaysRef.current;
    if (days.length === 0) return;
    const targetIndex = days.findIndex((day) => isSameDay(day, currentDateObj));
    if (targetIndex >= 0) {
      scrollToIndex(targetIndex);
      lastCenteredRef.current = { date: currentDate, viewMode };
    }
  }, [currentDate, currentDateObj, scrollToIndex, viewMode]);

  useEffect(() => {
    if (!scrollTargetDate) return;
    const targetDate = parseISO(scrollTargetDate);
    const days = visibleDaysRef.current;
    if (days.length === 0) return;
    const targetIndex = days.findIndex((day) => isSameDay(day, targetDate));
    if (targetIndex >= 0) {
      scrollToIndex(targetIndex);
    }
  }, [scrollRequestId, scrollTargetDate, scrollToIndex]);

  useEffect(() => {
    if (!highlightedTaskId || viewMode === 'calendar') return;
    const container = scrollContainerRef.current;
    if (!container) return;

    let cancelled = false;
    let attempts = 0;

    const scrollToHighlightedTask = () => {
      if (cancelled) return;
      const taskElement = container.querySelector<HTMLElement>(`[data-task-id="${highlightedTaskId}"]`);
      if (taskElement) {
        const containerRect = container.getBoundingClientRect();
        const taskRect = taskElement.getBoundingClientRect();
        const taskCenter = taskRect.left - containerRect.left + container.scrollLeft + taskRect.width / 2;
        const effectiveViewportWidth = viewportWidth || Math.max(0, container.clientWidth - sidebarViewportWidth);
        const viewportCenter = sidebarViewportWidth + effectiveViewportWidth / 2;
        const targetLeft = Math.max(0, taskCenter - viewportCenter);
        container.scrollTo({ left: targetLeft, behavior: 'smooth' });
        return;
      }
      if (attempts >= 30) return;
      attempts += 1;
      highlightedTaskScrollTimerRef.current = window.setTimeout(scrollToHighlightedTask, 100);
    };

    scrollToHighlightedTask();

    return () => {
      cancelled = true;
      if (highlightedTaskScrollTimerRef.current) {
        window.clearTimeout(highlightedTaskScrollTimerRef.current);
        highlightedTaskScrollTimerRef.current = null;
      }
    };
  }, [highlightedTaskId, sidebarViewportWidth, tasks.length, viewMode, viewportWidth]);
  
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

  const handleJumpToToday = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    setCurrentDate(today);
    requestScrollToDate(today);
  };

  const clearTimelineAttention = useCallback(() => {
    if (!timelineAttentionDate) return;
    setTimelineAttentionDate(null);
  }, [setTimelineAttentionDate, timelineAttentionDate]);

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

  const handleMilestoneRowDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.milestone-dot')) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const dayIndex = Math.floor(offsetX / dayWidth);
    if (dayIndex < 0 || dayIndex >= visibleDays.length) return;
    const date = format(visibleDays[dayIndex], 'yyyy-MM-dd');
    handleCreateMilestone(date);
    event.preventDefault();
    event.stopPropagation();
  }, [canEdit, dayWidth, handleCreateMilestone, visibleDays]);

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
  }, [assignees, canEdit, groupMode, onCreateTask, projects]);

  const visibleMilestoneLines = useMemo(
    () => buildVisibleMilestoneLines({
      milestones: sortedMilestones,
      visibleDayIndex,
      projectById,
      defaultColor: '#94a3b8',
    }),
    [projectById, sortedMilestones, visibleDayIndex],
  );

  const milestoneTooltipCells = useMemo(
    () => buildMilestoneTooltipCells({
      milestonesByDate,
      visibleDayIndex,
      projectById,
      defaultColor: '#94a3b8',
    }),
    [milestonesByDate, projectById, visibleDayIndex],
  );

  const renderMilestoneTooltipBody = useCallback((date: string, dayMilestones: Milestone[]) => (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {format(parseISO(date), 'dd MMM yyyy', { locale: dateLocale })}
      </div>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {dayMilestones.map((milestone) => {
          const project = projectById.get(milestone.projectId);
          const color = project?.color ?? '#94a3b8';
          const dotColor = hexToRgba(color, 0.8) ?? color;
          return (
            <div key={milestone.id} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
              <div className="min-w-0">
                <div className="truncate">{milestone.title}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {project
                    ? formatProjectLabel(project.name, project.code)
                    : t`Project`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 pt-1">
        <span className="text-muted-foreground">{t`Total milestones`}</span>
        <span className="font-semibold">{dayMilestones.length}</span>
      </div>
    </div>
  ), [dateLocale, projectById]);

  const renderMilestoneMenuItems = useCallback((dayMilestones: Milestone[]) => (
    <>
      <DropdownMenuLabel>{t`Milestones`}</DropdownMenuLabel>
      {dayMilestones.map((milestone) => {
        const project = projectById.get(milestone.projectId);
        const color = project?.color ?? '#94a3b8';
        const dotColor = hexToRgba(color, 0.8) ?? color;
        return (
          <DropdownMenuItem
            key={milestone.id}
            onSelect={() => handleEditMilestone(milestone)}
            className="items-start gap-2"
          >
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
            <span className="min-w-0">
              <span className="block truncate text-[11px] text-muted-foreground">
                {project
                  ? formatProjectLabel(project.name, project.code)
                  : t`Project`}
              </span>
              <span className="block truncate text-sm">
                {milestone.title}
              </span>
            </span>
          </DropdownMenuItem>
        );
      })}
    </>
  ), [handleEditMilestone, projectById]);

  const renderMilestoneContextMenu = useCallback((date: string) => (
    <ContextMenuContent>
      <ContextMenuItem
        disabled={!canEdit}
        onSelect={() => {
          if (!canEdit) return;
          handleCreateMilestone(date);
        }}
      >
        {t`Create milestone`}
      </ContextMenuItem>
    </ContextMenuContent>
  ), [canEdit, handleCreateMilestone]);

  // Линия начинается от нижней точки круга вехи (h-2.5 = 10px, радиус 5px)
  const milestoneDotRadius = 5;
  const milestoneLineTop = HEADER_HEIGHT + milestoneRowHeight / 2 + milestoneDotRadius;
  const milestoneLineHeight = `calc(100% - ${milestoneLineTop}px)`;
  const milestoneLineWidth = 3;
  const milestoneLineHoverWidth = 4;
  const milestoneHeaderRowTop = 40;
  const milestoneHeaderRowHeight = HEADER_HEIGHT - milestoneHeaderRowTop;
  const getSidebarRowMonogram = useCallback((rowName: string) => getPersonMonogram(rowName, 'U'), []);

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
                  <div className="relative border-b border-border" style={{ width: totalWidth }}>
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
                    <TooltipProvider delayDuration={180}>
                      {milestoneTooltipCells.map((cell) => {
                        const triggerStyle = {
                          left: cell.dayIndex * dayWidth,
                          width: dayWidth,
                          top: milestoneHeaderRowTop,
                          height: milestoneHeaderRowHeight,
                        };
                        const hasMultipleMilestones = cell.milestones.length > 1;
                        if (hasMultipleMilestones) {
                          return (
                            <ContextMenu key={`header-milestone-cell-${cell.date}`}>
                              <DropdownMenu>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <ContextMenuTrigger asChild>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          ref={(node) => {
                                            if (node) {
                                              milestoneHeaderMenuTriggerRefs.current.set(cell.date, node);
                                            } else {
                                              milestoneHeaderMenuTriggerRefs.current.delete(cell.date);
                                            }
                                          }}
                                          type="button"
                                          className="milestone-cell absolute z-10 cursor-pointer bg-transparent"
                                          style={triggerStyle}
                                          onClick={(event) => event.stopPropagation()}
                                          onDoubleClick={(event) => event.stopPropagation()}
                                          onMouseEnter={() => handleMilestoneHover(cell.date, cell.color)}
                                          onMouseLeave={handleMilestoneHoverEnd}
                                          aria-label={t`Select milestone`}
                                        />
                                      </DropdownMenuTrigger>
                                    </ContextMenuTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="bottom"
                                    sideOffset={6}
                                    className="w-56 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
                                  >
                                    {renderMilestoneTooltipBody(cell.date, cell.milestones)}
                                  </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="center" className="w-72">
                                  {renderMilestoneMenuItems(cell.milestones)}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {renderMilestoneContextMenu(cell.date)}
                            </ContextMenu>
                          );
                        }

                        const singleMilestone = cell.milestones[0];
                        if (!singleMilestone) return null;

                        return (
                          <ContextMenu key={`header-milestone-cell-${cell.date}`}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <ContextMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="milestone-cell absolute z-10 cursor-pointer bg-transparent"
                                    style={triggerStyle}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleEditMilestone(singleMilestone);
                                    }}
                                    onDoubleClick={(event) => event.stopPropagation()}
                                    onMouseEnter={() => handleMilestoneHover(cell.date, cell.color)}
                                    onMouseLeave={handleMilestoneHoverEnd}
                                    aria-label={t`Edit milestone`}
                                  />
                                </ContextMenuTrigger>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                sideOffset={6}
                                className="w-56 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
                              >
                                {renderMilestoneTooltipBody(cell.date, cell.milestones)}
                              </TooltipContent>
                            </Tooltip>
                            {renderMilestoneContextMenu(cell.date)}
                          </ContextMenu>
                        );
                      })}
                    </TooltipProvider>
                  </div>
                  <div
                    className="relative border-b border-border bg-timeline-header"
                    style={{ width: totalWidth, height: milestoneRowHeight }}
                    onDoubleClick={handleMilestoneRowDoubleClick}
                  >
                    <TooltipProvider delayDuration={180}>
                      {milestoneTooltipCells.map((cell) => {
                        const triggerStyle = {
                          left: cell.dayIndex * dayWidth,
                          width: dayWidth,
                        };
                        const hasMultipleMilestones = cell.milestones.length > 1;
                        if (hasMultipleMilestones) {
                          return (
                            <ContextMenu key={`milestone-cell-${cell.date}`}>
                              <DropdownMenu>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <ContextMenuTrigger asChild>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          type="button"
                                          className="milestone-cell absolute inset-y-0 cursor-pointer bg-transparent"
                                          style={triggerStyle}
                                          onClick={(event) => event.stopPropagation()}
                                          onDoubleClick={(event) => event.stopPropagation()}
                                          onMouseEnter={() => handleMilestoneHover(cell.date, cell.color)}
                                          onMouseLeave={handleMilestoneHoverEnd}
                                          aria-label={t`Select milestone`}
                                        />
                                      </DropdownMenuTrigger>
                                    </ContextMenuTrigger>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="bottom"
                                    sideOffset={6}
                                    className="w-56 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
                                  >
                                    {renderMilestoneTooltipBody(cell.date, cell.milestones)}
                                  </TooltipContent>
                                </Tooltip>
                                <DropdownMenuContent align="center" className="w-72">
                                  {renderMilestoneMenuItems(cell.milestones)}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {renderMilestoneContextMenu(cell.date)}
                            </ContextMenu>
                          );
                        }

                        const singleMilestone = cell.milestones[0];
                        if (!singleMilestone) return null;

                        return (
                          <ContextMenu key={`milestone-cell-${cell.date}`}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <ContextMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="milestone-cell absolute inset-y-0 cursor-pointer bg-transparent"
                                    style={triggerStyle}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleEditMilestone(singleMilestone);
                                    }}
                                    onDoubleClick={(event) => event.stopPropagation()}
                                    onMouseEnter={() => handleMilestoneHover(cell.date, cell.color)}
                                    onMouseLeave={handleMilestoneHoverEnd}
                                    aria-label={t`Edit milestone`}
                                  />
                                </ContextMenuTrigger>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                sideOffset={6}
                                className="w-56 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
                              >
                                {renderMilestoneTooltipBody(cell.date, cell.milestones)}
                              </TooltipContent>
                            </Tooltip>
                            {renderMilestoneContextMenu(cell.date)}
                          </ContextMenu>
                        );
                      })}

                      {sortedMilestones.map((milestone) => {
                        const dayIndex = visibleDayIndex.get(milestone.date);
                        if (dayIndex === undefined) return null;
                        const project = projectById.get(milestone.projectId);
                        const color = project?.color ?? '#94a3b8';
                        const dotColor = hexToRgba(color, 0.45) ?? color;
                        const dotBorder = hexToRgba(color, 0.8) ?? color;
                        const offset = milestoneOffsets.get(milestone.id) ?? 0;
                        const left = dayIndex * dayWidth + dayWidth / 2 + offset;
                        const dayMilestones = milestonesByDate.get(milestone.date) ?? [];
                        const hasMultipleMilestones = dayMilestones.length > 1;

                        if (hasMultipleMilestones) {
                          return (
                            <span
                              key={milestone.id}
                              className="milestone-dot pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                              style={{ left, backgroundColor: dotColor, borderColor: dotBorder }}
                            />
                          );
                        }

                        return (
                          <ContextMenu key={milestone.id}>
                            <ContextMenuTrigger asChild>
                              <button
                                type="button"
                                className="milestone-dot absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-transform hover:scale-110"
                                style={{ left, backgroundColor: dotColor, borderColor: dotBorder }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleEditMilestone(milestone);
                                }}
                                onMouseEnter={() => handleMilestoneHover(milestone.date, color)}
                                onMouseLeave={handleMilestoneHoverEnd}
                              />
                            </ContextMenuTrigger>
                            {renderMilestoneContextMenu(milestone.date)}
                          </ContextMenu>
                        );
                      })}
                    </TooltipProvider>
                  </div>
                </div>
              </div>
            </div>
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
                        <span
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold uppercase tracking-[0.04em] text-foreground"
                          title={row.name}
                          aria-label={row.name}
                        >
                          {getSidebarRowMonogram(row.name)}
                        </span>
                      ) : (
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
