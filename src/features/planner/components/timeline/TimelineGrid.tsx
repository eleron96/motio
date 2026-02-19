import React, { startTransition, useCallback, useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { useAuthStore } from '@/features/auth/store/authStore';
import { TimelineHeader } from './TimelineHeader';
import { TimelineRow } from './TimelineRow';
import { TaskBar } from './TaskBar';
import { MilestoneDialog } from './MilestoneDialog';
import { getVisibleDays, getDayWidth, getTaskPosition, SIDEBAR_WIDTH, HEADER_HEIGHT, MIN_ROW_HEIGHT, TASK_HEIGHT, TASK_GAP } from '@/features/planner/lib/dateUtils';
import { Milestone, Task, ViewMode } from '@/features/planner/types/planner';

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
import { calculateTaskLanes, getMaxLanes, TaskWithLane } from '@/features/planner/lib/taskLanes';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/ui/tooltip';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { differenceInDays, format, isSameDay, parseISO } from 'date-fns';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';

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

const countUniqueTaskUnits = (tasks: Task[]) => {
  const units = new Set<string>();
  tasks.forEach((task) => {
    units.add(task.repeatId ? `r:${task.repeatId}` : `t:${task.id}`);
  });
  return units.size;
};

const clampTimelineSidebarWidth = (value: number) => (
  Math.max(TIMELINE_SIDEBAR_MIN_WIDTH, Math.min(TIMELINE_SIDEBAR_MAX_WIDTH, value))
);

export const TimelineGrid: React.FC<TimelineGridProps> = ({
  onCreateTask,
  sidebarWidth = null,
  onSidebarWidthChange,
  onSidebarWidthReset,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const { 
    tasks,
    milestones,
    projects, 
    assignees, 
    memberGroupAssignments,
    viewMode, 
    groupMode, 
    currentDate,
    setCurrentDate,
    requestScrollToDate,
    scrollTargetDate,
    scrollRequestId,
    filters,
    assigneeTaskCounts,
    highlightedTaskId,
    timelineAttentionDate,
    setTimelineAttentionDate,
  } = usePlannerStore();
  const user = useAuthStore((state) => state.user);
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const filteredAssignees = useFilteredAssignees(assignees);

  const assigneeGroupMap = useMemo(() => {
    const groupByUserId = new Map(memberGroupAssignments.map((assignment) => [assignment.userId, assignment.groupId]));
    const map = new Map<string, string>();
    assignees.forEach((assignee) => {
      if (!assignee.userId) return;
      const groupId = groupByUserId.get(assignee.userId);
      if (groupId) {
        map.set(assignee.id, groupId);
      }
    });
    return map;
  }, [assignees, memberGroupAssignments]);

  const myAssigneeId = useMemo(() => {
    if (!user?.id) return null;
    return assignees.find((a) => a.userId === user.id)?.id ?? null;
  }, [assignees, user?.id]);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sidebarContainerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const syncingRef = useRef<HTMLDivElement | null>(null);
  const syncingVerticalRef = useRef(false);
  const dragScrollRef = useRef<{
    startX: number;
    startScrollLeft: number;
    target: HTMLDivElement | null;
    didMove: boolean;
  } | null>(null);
  const lastDragTimeRef = useRef(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const lastRenderedFocusIndexRef = useRef(-1);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const pendingScrollLeftRef = useRef<number | null>(null);
  const [isDragScrolling, setIsDragScrolling] = useState(false);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [sidebarPad, setSidebarPad] = useState(0);
  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [milestoneDialogDate, setMilestoneDialogDate] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [milestoneLine, setMilestoneLine] = useState<{
    date: string;
    color: string;
    visible: boolean;
  } | null>(null);
  const milestoneRowHeight = 24;
  const resolvedSidebarWidth = typeof sidebarWidth === 'number' && Number.isFinite(sidebarWidth)
    ? `${clampTimelineSidebarWidth(sidebarWidth)}px`
    : `clamp(${TIMELINE_SIDEBAR_MIN_WIDTH}px, 26vw, ${TIMELINE_SIDEBAR_AUTO_MAX_WIDTH}px)`;
  
  const visibleDays = useMemo(() => getVisibleDays(currentDate, viewMode), [currentDate, viewMode]);
  const dayWidth = useMemo(() => getDayWidth(viewMode), [viewMode]);
  const totalWidth = visibleDays.length * dayWidth;
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
    const today = new Date();
    const todayIndex = visibleDays.findIndex((day) => isSameDay(day, today));
    if (todayIndex < 0) return true;

    const todayStart = todayIndex * dayWidth;
    const todayEnd = todayStart + dayWidth;
    const viewportStart = scrollLeft;
    const viewportEnd = scrollLeft + viewportWidth;
    return todayEnd <= viewportStart || todayStart >= viewportEnd;
  }, [dayWidth, scrollLeft, viewportWidth, visibleDays]);
  const scrollEndTimerRef = useRef<number | null>(null);
  const highlightedTaskScrollTimerRef = useRef<number | null>(null);
  const pendingScrollDateRef = useRef<string | null>(null);
  const lastEdgeReanchorAtRef = useRef(0);
  const visibleDaysRef = useRef<Date[]>([]);
  const ignoreScrollDateUpdateRef = useRef(false);
  const skipAutoCenterRef = useRef(false);
  const prevRangeRef = useRef<{ start: Date | null; viewMode: string } | null>(null);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );

  const filteredMilestones = useMemo(() => {
    if (filters.projectIds.length === 0) return milestones;
    return milestones.filter((milestone) => filters.projectIds.includes(milestone.projectId));
  }, [milestones, filters.projectIds]);

  const sortedMilestones = useMemo(() => {
    return [...filteredMilestones].sort((left, right) => {
      if (left.date === right.date) {
        return left.title.localeCompare(right.title);
      }
      return left.date.localeCompare(right.date);
    });
  }, [filteredMilestones]);

  const visibleDayIndex = useMemo(() => {
    const map = new Map<string, number>();
    visibleDays.forEach((day, index) => {
      map.set(format(day, 'yyyy-MM-dd'), index);
    });
    return map;
  }, [visibleDays]);

  const milestonesByDate = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    sortedMilestones.forEach((milestone) => {
      const list = map.get(milestone.date) ?? [];
      list.push(milestone);
      map.set(milestone.date, list);
    });
    return map;
  }, [sortedMilestones]);

  const milestoneOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    milestonesByDate.forEach((items) => {
      items.forEach((item, index) => {
        const offset = items.length > 1 ? (index - (items.length - 1) / 2) * 8 : 0;
        offsets.set(item.id, offset);
      });
    });
    return offsets;
  }, [milestonesByDate]);
  
  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filters.projectIds.length > 0 && task.projectId && !filters.projectIds.includes(task.projectId)) {
        return false;
      }
      if (filters.assigneeIds.length > 0) {
        if (!task.assigneeIds.some((id) => filters.assigneeIds.includes(id))) {
          return false;
        }
      } else if (filters.hideUnassigned && task.assigneeIds.length === 0) {
        return false;
      }
      if (filters.statusIds.length > 0 && !filters.statusIds.includes(task.statusId)) {
        return false;
      }
      if (filters.typeIds.length > 0 && !filters.typeIds.includes(task.typeId)) {
        return false;
      }
      if (filters.tagIds.length > 0 && !filters.tagIds.some(id => task.tagIds.includes(id))) {
        return false;
      }
      if (filters.groupIds.length > 0) {
        const matchesGroup = task.assigneeIds.some((id) => {
          const groupId = assigneeGroupMap.get(id);
          return groupId ? filters.groupIds.includes(groupId) : false;
        });
        if (!matchesGroup) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filters, assigneeGroupMap]);
  
  const visibleAssignees = useMemo(() => {
    if (groupMode !== 'assignee') return filteredAssignees;
    let list = filteredAssignees;
    if (filters.assigneeIds.length > 0) {
      list = list.filter((assignee) => filters.assigneeIds.includes(assignee.id));
    }
    if (filters.groupIds.length > 0) {
      list = list.filter((assignee) => {
        const groupId = assigneeGroupMap.get(assignee.id);
        return groupId ? filters.groupIds.includes(groupId) : false;
      });
    }
    return list;
  }, [assigneeGroupMap, filteredAssignees, filters.assigneeIds, filters.groupIds, groupMode]);

  // Group items (assignees or projects). При группировке по исполнителям: сначала текущий пользователь, затем остальные по алфавиту.
  const groupItems = useMemo(() => {
    if (groupMode === 'assignee') {
      const sorted = [...visibleAssignees].sort((a, b) => {
        if (myAssigneeId && a.id === myAssigneeId) return -1;
        if (myAssigneeId && b.id === myAssigneeId) return 1;
        return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
      });
      return sorted.map(a => ({ id: a.id, name: a.name, color: undefined }));
    }
    return projects.map(p => ({ id: p.id, name: formatProjectLabel(p.name, p.code), color: p.color }));
  }, [groupMode, visibleAssignees, projects, myAssigneeId]);
  
  // Group tasks by row with lane calculation
  const tasksByRow = useMemo(() => {
    const grouped: Record<string, TaskWithLane[]> = {};
    
    groupItems.forEach(item => {
      grouped[item.id] = [];
    });
    grouped['unassigned'] = [];
    
    // Group tasks first
    const tasksPerGroup: Record<string, Task[]> = {};
    groupItems.forEach(item => {
      tasksPerGroup[item.id] = [];
    });
    tasksPerGroup['unassigned'] = [];
    
    const visibleGroupIds = new Set(groupItems.map((item) => item.id));

    filteredTasks.forEach(task => {
      if (groupMode === 'assignee') {
        const matchingAssignees = Array.from(new Set(task.assigneeIds)).filter((id) => visibleGroupIds.has(id));
        if (matchingAssignees.length === 0) {
          tasksPerGroup['unassigned'].push(task);
          return;
        }
        matchingAssignees.forEach((assigneeId) => {
          if (!tasksPerGroup[assigneeId]) {
            tasksPerGroup[assigneeId] = [];
          }
          tasksPerGroup[assigneeId].push(task);
        });
        return;
      }

      const groupId = task.projectId || 'unassigned';
      if (!tasksPerGroup[groupId]) {
        tasksPerGroup[groupId] = [];
      }
      tasksPerGroup[groupId].push(task);
    });
    
    // Calculate lanes for each group
    Object.entries(tasksPerGroup).forEach(([groupId, tasks]) => {
      grouped[groupId] = calculateTaskLanes(tasks);
    });
    
    return grouped;
  }, [filteredTasks, groupItems, groupMode]);
  
  // Calculate row heights based on max lanes
  const rowHeights = useMemo(() => {
    const heights: Record<string, number> = {};
    
    Object.entries(tasksByRow).forEach(([groupId, tasks]) => {
      const maxLanes = getMaxLanes(tasks);
      // Calculate height: padding (16px) + (task height + gap) * lanes
      const calculatedHeight = 16 + maxLanes * (TASK_HEIGHT + TASK_GAP);
      heights[groupId] = Math.max(MIN_ROW_HEIGHT, calculatedHeight);
    });
    
    return heights;
  }, [tasksByRow]);
  
  const handleSidebarScroll = useCallback(() => {
    if (syncingVerticalRef.current) {
      syncingVerticalRef.current = false;
      return;
    }
    const sidebar = sidebarRef.current;
    const grid = scrollContainerRef.current;
    if (!sidebar || !grid || sidebar.scrollTop === grid.scrollTop) return;
    syncingVerticalRef.current = true;
    grid.scrollTop = sidebar.scrollTop;
    requestAnimationFrame(() => {
      syncingVerticalRef.current = false;
    });
  }, []);

  // Горизонтальный скролл: scrollLeft для линий вех и подписи месяца; вертикальная синхронизация с сайдбаром
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (syncingRef.current && syncingRef.current !== e.currentTarget) {
      return;
    }
    syncingRef.current = e.currentTarget;
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
    requestAnimationFrame(() => {
      syncingRef.current = null;
    });

    if (syncingVerticalRef.current) {
      syncingVerticalRef.current = false;
    } else {
      const sidebar = sidebarRef.current;
      const grid = e.currentTarget;
      if (sidebar && grid && sidebar.scrollTop !== grid.scrollTop) {
        syncingVerticalRef.current = true;
        sidebar.scrollTop = grid.scrollTop;
        requestAnimationFrame(() => {
          syncingVerticalRef.current = false;
        });
      }
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
  }, [currentDate, dayWidth, scrollReanchorEdgeTriggerDays, scrollReanchorMinShiftDays, setCurrentDate, visibleDays]);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (target instanceof Element && target.closest('.task-bar, .milestone-dot, .milestone-cell')) {
      return;
    }
    dragScrollRef.current = {
      startX: e.clientX,
      startScrollLeft: e.currentTarget.scrollLeft,
      target: e.currentTarget,
      didMove: false,
    };
    setIsDragScrolling(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!isDragScrolling) return;

    const handleMouseMove = (e: MouseEvent) => {
      const state = dragScrollRef.current;
      if (!state?.target) return;
      const deltaX = e.clientX - state.startX;
      if (!state.didMove && Math.abs(deltaX) > 4) {
        state.didMove = true;
      }
      const nextScrollLeft = state.startScrollLeft - deltaX;
      state.target.scrollLeft = nextScrollLeft;
    };

    const handleMouseUp = () => {
      if (dragScrollRef.current?.didMove) {
        lastDragTimeRef.current = Date.now();
      }
      dragScrollRef.current = null;
      setIsDragScrolling(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragScrolling]);

  useEffect(() => {
    if (!isSidebarResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = sidebarResizeRef.current;
      if (!resizeState || !onSidebarWidthChange) return;
      const deltaX = event.clientX - resizeState.startX;
      onSidebarWidthChange(clampTimelineSidebarWidth(resizeState.startWidth + deltaX));
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
  }, [isSidebarResizing, onSidebarWidthChange]);

  const handleSidebarResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSidebarWidthChange) return;
    const currentWidth = sidebarContainerRef.current?.getBoundingClientRect().width ?? TIMELINE_SIDEBAR_MIN_WIDTH;
    sidebarResizeRef.current = { startX: event.clientX, startWidth: currentWidth };
    setIsSidebarResizing(true);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    event.preventDefault();
  }, [onSidebarWidthChange]);

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
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const updateWidth = () => setViewportWidth(container.clientWidth);
    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(container);
      return () => observer.disconnect();
    }
    return undefined;
  }, []);

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
        const targetLeft = Math.max(0, taskCenter - container.clientWidth / 2);
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
  }, [highlightedTaskId, tasks.length, viewMode]);
  
  // Rows to display (including unassigned if there are unassigned tasks). В режиме по исполнителям — чуть больше отступ между строками пользователей.
  const displayRows = useMemo(() => {
    const rows = groupItems.map(item => {
      const baseHeight = rowHeights[item.id] || MIN_ROW_HEIGHT;
      const height = groupMode === 'assignee' && item.id !== 'unassigned'
        ? baseHeight + ASSIGNEE_ROW_GAP
        : baseHeight;
      return {
        ...item,
        tasks: tasksByRow[item.id] || [],
        height,
      };
    });

    const showUnassignedRow = tasksByRow['unassigned']?.length > 0
      && (groupMode === 'project' || (filters.assigneeIds.length === 0 && !filters.hideUnassigned));
    
    if (showUnassignedRow) {
      rows.push({
        id: 'unassigned',
        name: groupMode === 'assignee' ? t`Unassigned` : t`No project`,
        color: '#94a3b8',
        tasks: tasksByRow['unassigned'],
        height: rowHeights['unassigned'] || MIN_ROW_HEIGHT,
      });
    }
    
    return rows;
  }, [filters.assigneeIds.length, filters.hideUnassigned, groupItems, groupMode, rowHeights, tasksByRow]);

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

  useLayoutEffect(() => {
    const sidebar = sidebarRef.current;
    const grid = scrollContainerRef.current;
    if (!sidebar || !grid) return;

    const updatePad = () => {
      const sidebarRange = sidebar.scrollHeight - sidebar.clientHeight;
      const gridRange = grid.scrollHeight - grid.clientHeight;
      const adjustedSidebarRange = Math.max(0, sidebarRange - sidebarPad);
      const diff = Math.max(0, gridRange - adjustedSidebarRange);
      setSidebarPad(diff);
    };

    updatePad();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updatePad);
      observer.observe(sidebar);
      observer.observe(grid);
      return () => observer.disconnect();
    }
    return undefined;
  }, [displayRows, sidebarPad]);

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

  const handleEditMilestone = useCallback((milestone: Milestone) => {
    setEditingMilestone(milestone);
    setMilestoneDialogDate(null);
    setMilestoneDialogOpen(true);
  }, []);

  const handleMilestoneRowDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    if (Date.now() - lastDragTimeRef.current < 200) return;
    const target = e.target;
    if (target instanceof Element && target.closest('.milestone-dot')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const index = Math.floor(offsetX / dayWidth);
    if (index < 0 || index >= visibleDays.length) return;
    handleCreateMilestone(format(visibleDays[index], 'yyyy-MM-dd'));
  }, [canEdit, dayWidth, handleCreateMilestone, visibleDays]);

  const handleMilestoneDateDoubleClick = useCallback((date: string) => {
    if (!canEdit) return;
    if (Date.now() - lastDragTimeRef.current < 200) return;
    handleCreateMilestone(date);
  }, [canEdit, handleCreateMilestone]);

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

  // По умолчанию показываем линию от каждой вехи, попадающей в видимый диапазон дат
  const visibleMilestoneLines = useMemo(() => {
    const lines: { date: string; color: string }[] = [];
    const seenDates = new Set<string>();
    for (const m of sortedMilestones) {
      if (!visibleDayIndex.has(m.date) || seenDates.has(m.date)) continue;
      seenDates.add(m.date);
      const project = projectById.get(m.projectId);
      lines.push({ date: m.date, color: project?.color ?? '#94a3b8' });
    }
    return lines;
  }, [sortedMilestones, visibleDayIndex, projectById]);

  const milestoneTooltipCells = useMemo(() => {
    const cells: Array<{ date: string; dayIndex: number; color: string; milestones: Milestone[] }> = [];
    milestonesByDate.forEach((dayMilestones, date) => {
      const dayIndex = visibleDayIndex.get(date);
      if (typeof dayIndex !== 'number') return;
      const project = projectById.get(dayMilestones[0]?.projectId ?? '');
      cells.push({
        date,
        dayIndex,
        color: project?.color ?? '#94a3b8',
        milestones: dayMilestones,
      });
    });
    cells.sort((left, right) => left.dayIndex - right.dayIndex);
    return cells;
  }, [milestonesByDate, projectById, visibleDayIndex]);

  // Линия начинается от нижней точки круга вехи (h-2.5 = 10px, радиус 5px)
  const milestoneDotRadius = 5;
  const milestoneLineTop = HEADER_HEIGHT + milestoneRowHeight / 2 + milestoneDotRadius;
  const milestoneLineHeight = `calc(100% - ${milestoneLineTop}px)`;
  const milestoneLineWidth = 3;
  const milestoneLineHoverWidth = 4;

  return (
    <div className={cn(
      'relative flex flex-col h-full overflow-hidden bg-background',
      highlightedTaskId && 'task-highlight-mode'
    )}
    onPointerDownCapture={clearTimelineAttention}
    onWheelCapture={clearTimelineAttention}
    onTouchStartCapture={clearTimelineAttention}
    >
      {/* Сайдбар и сетка — два скролла с синхронизацией по вертикали */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div
          ref={sidebarContainerRef}
          className="flex flex-col flex-shrink-0 bg-timeline-header border-r border-border"
          style={{ width: resolvedSidebarWidth }}
        >
          <div className="flex-shrink-0 border-b border-border" style={{ height: HEADER_HEIGHT }} />
          <div className="flex-shrink-0 border-b border-border" style={{ height: milestoneRowHeight }} />
          <div
            ref={sidebarRef}
            className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden"
            onScroll={handleSidebarScroll}
          >
            {displayRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-2 px-4 border-b border-border hover:bg-timeline-row-hover transition-colors box-border"
                style={{ height: row.height }}
              >
                <div className="min-w-0 flex flex-1 items-center gap-3">
                  {row.color && (
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                  )}
                  <span
                    className="min-w-0 text-sm font-medium text-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2"
                    title={row.name}
                  >
                    {row.name}
                  </span>
                </div>
                <span className="shrink-0 pl-2 text-xs text-muted-foreground">
                  {groupMode === 'assignee' && row.id !== 'unassigned'
                    ? (assigneeTaskCounts[row.id] ?? countUniqueTaskUnits(row.tasks))
                    : row.tasks.length}
                </span>
              </div>
            ))}
            {sidebarPad > 0 && (
              <div aria-hidden className="w-full" style={{ height: sidebarPad }} />
            )}
          </div>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize timeline sidebar"
          className={`h-full w-1 flex-shrink-0 cursor-col-resize bg-transparent transition-colors ${isSidebarResizing ? 'bg-border/80' : 'hover:bg-border/70'}`}
          onMouseDown={handleSidebarResizeStart}
          onDoubleClick={handleSidebarResizeReset}
        />
        <div
          ref={scrollContainerRef}
          className={`flex-1 min-w-0 overflow-auto scrollbar-soft ${isDragScrolling ? 'cursor-grabbing' : 'cursor-grab'}`}
          onScroll={handleScroll}
          onMouseDown={handleDragStart}
        >
          <div className="relative" style={{ width: totalWidth, minHeight: '100%' }}>
            {/* Линии вех внутри скролла — под задачами и под интерфейсом создания задачи */}
            <div
              className="pointer-events-none absolute z-0 left-0"
              style={{ top: milestoneLineTop, width: totalWidth, height: milestoneLineHeight }}
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
              <div className="border-b border-border" style={{ width: totalWidth }}>
                <TimelineHeader
                  visibleDays={visibleDays}
                  dayWidth={dayWidth}
                  viewMode={viewMode}
                  scrollLeft={scrollLeft}
                  viewportWidth={viewportWidth}
                  attentionDate={timelineAttentionDate}
                  onDateDoubleClick={canEdit ? handleMilestoneDateDoubleClick : undefined}
                />
              </div>
              <div
                className="relative border-b border-border bg-timeline-header"
                style={{ width: totalWidth, height: milestoneRowHeight }}
                onDoubleClick={handleMilestoneRowDoubleClick}
              >
                <TooltipProvider delayDuration={180}>
                  {milestoneTooltipCells.map((cell) => (
                    <Tooltip key={`milestone-cell-${cell.date}`}>
                      <TooltipTrigger asChild>
                        <div
                          className="milestone-cell absolute inset-y-0 cursor-pointer"
                          style={{ left: cell.dayIndex * dayWidth, width: dayWidth }}
                          onMouseEnter={() => handleMilestoneHover(cell.date, cell.color)}
                          onMouseLeave={handleMilestoneHoverEnd}
                        />
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        sideOffset={6}
                        className="w-56 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
                      >
                        <div className="space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {format(parseISO(cell.date), 'dd MMM yyyy', { locale: dateLocale })}
                          </div>
                          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                            {cell.milestones.map((milestone) => {
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
                            <span className="font-semibold">{cell.milestones.length}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}

                  {sortedMilestones.map((milestone) => {
                    const dayIndex = visibleDayIndex.get(milestone.date);
                    if (dayIndex === undefined) return null;
                    const project = projectById.get(milestone.projectId);
                    const color = project?.color ?? '#94a3b8';
                    const dotColor = hexToRgba(color, 0.45) ?? color;
                    const dotBorder = hexToRgba(color, 0.8) ?? color;
                    const offset = milestoneOffsets.get(milestone.id) ?? 0;
                    const left = dayIndex * dayWidth + dayWidth / 2 + offset;

                    return (
                      <button
                        key={milestone.id}
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
                    );
                  })}
                </TooltipProvider>
              </div>
            </div>
            {displayRows.map((row, rowIndex) => (
              <TimelineRow
                key={row.id}
                rowId={row.id}
                rowIndex={rowIndex}
                visibleDays={visibleDays}
                dayWidth={dayWidth}
                viewMode={viewMode}
                height={row.height}
                canEdit={canEdit}
                onCreateTask={handleCreateTaskAt}
              >
                {rowTaskElementsById.get(row.id)}
              </TimelineRow>
            ))}
          </div>
        </div>
      </div>

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
