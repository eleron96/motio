import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { RepeatTaskUpdateScope, Task, TaskPriority } from '@/features/planner/types/planner';
import { RepeatTaskScopeDialog } from '@/features/planner/components/RepeatTaskScopeDialog';
import { cn } from '@/shared/lib/classNames';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { calculateNewDates, calculateResizedDates, formatDateRange, TASK_HEIGHT, TASK_GAP, ROW_TOP_PADDING } from '@/features/planner/lib/dateUtils';
import { computeDragDeltaDays, getEdgeScrollVelocity } from '@/features/planner/lib/dragAutoScroll';
import { useTimelineDragScroll } from './TimelineDragScrollContext';
import { getTaskBarAppearance } from '@/features/planner/lib/taskBarColors';
import { Ban, MessageSquare, RotateCw } from 'lucide-react';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { Badge } from '@/shared/ui/badge';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { TaskBarMenu } from './TaskBarMenu';
import { TaskBarDeleteDialog } from './TaskBarDeleteDialog';

// Mobile gesture thresholds.
const TAP_MOVE_THRESHOLD = 10; // px of movement that turns a tap into a scroll
const DOUBLE_TAP_MS = 280; // window to detect a double tap (and to debounce a single)

interface TaskBarProps {
  task: Task;
  position: { left: number; width: number };
  dayWidth: number;
  visibleDays: Date[];
  lane: number;
  canEdit: boolean;
  rowAssigneeId?: string | null;
}

type PendingRepeatMove = {
  endDate: string;
  startDate: string;
};

const TaskBarBase: React.FC<TaskBarProps> = ({
  task,
  position,
  dayWidth,
  visibleDays,
  lane,
  canEdit,
  rowAssigneeId = null,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  // Display-only slices. These arrays change rarely (project/status/type/
  // assignee edits), so subscribing here does NOT cause the per-bar re-render
  // storms that `tasks`/`selectedTaskId` used to — those were removed below.
  const projects = usePlannerStore((state) => state.projects);
  const statuses = usePlannerStore((state) => state.statuses);
  const taskTypes = usePlannerStore((state) => state.taskTypes);
  const assignees = usePlannerStore((state) => state.assignees);
  const moveTask = usePlannerStore((state) => state.moveTask);
  const moveTaskDetached = usePlannerStore((state) => state.moveTaskDetached);
  const setSelectedTaskId = usePlannerStore((state) => state.setSelectedTaskId);
  const setHighlightedTaskId = usePlannerStore((state) => state.setHighlightedTaskId);
  // Boolean selectors: this bar only re-renders when ITS own selected/
  // highlighted state flips, not on every selection change across the board.
  const isSelected = usePlannerStore((state) => state.selectedTaskId === task.id);
  const isHighlighted = usePlannerStore((state) => state.highlightedTaskId === task.id);
  const commentCount = usePlannerStore((state) => state.taskCommentCounts?.[task.id] ?? 0);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  // Visual offset of the bar (px) while dragging/resizing: mouse travel plus
  // whatever the timeline scrolled underneath since the press.
  const [dragOffsetX, setDragOffsetX] = useState(0);
  // Live drag bookkeeping kept out of React state so the document listeners
  // and the auto-scroll frame loop are registered once per drag, not per move.
  const dragStateRef = useRef({
    startX: 0,
    startScrollLeft: 0,
    lastClientX: 0,
    x: 0,
    moved: false,
  });
  const autoScrollFrameRef = useRef<number | null>(null);
  const dragScroll = useTimelineDragScroll();
  const [isHovering, setIsHovering] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Mount the delete dialog only after it has been opened at least once, so its
  // `tasks`/`assignees` subscriptions stay dormant for bars never deleted. Once
  // mounted it stays mounted (driven by `open`) to preserve the close animation.
  const [deleteMounted, setDeleteMounted] = useState(false);
  const [pendingRepeatMove, setPendingRepeatMove] = useState<PendingRepeatMove | null>(null);
  const [repeatScopeOpen, setRepeatScopeOpen] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  // Mobile: the info tooltip is driven by an explicit single tap, not hover.
  const [mobileTooltipOpen, setMobileTooltipOpen] = useState(false);
  const tapStartRef = useRef<{ x: number; y: number } | null>(null);
  const tapMovedRef = useRef(false);
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<number | null>(null);
  // Set when a long-press opens the context menu, so the trailing touchend is
  // not mistaken for a tap.
  const menuJustOpenedRef = useRef(false);
  const tooltipElRef = useRef<HTMLDivElement>(null);

  const project = projects.find(p => p.id === task.projectId);
  const status = statuses.find(s => s.id === task.statusId);
  const taskType = taskTypes.find(t => t.id === task.typeId);
  const assignedAssignees = assignees.filter((assignee) => task.assigneeIds.includes(assignee.id));
  const assigneeLabel = assignedAssignees.length === 0
    ? t`Unassigned`
    : assignedAssignees.map((assignee) => assignee.name).join(', ');
  const priorityLabels: Record<TaskPriority, string> = {
    low: t`Low priority`,
    medium: t`Medium priority`,
    high: t`High priority`,
  };
  const isRepeating = Boolean(task.repeatId);

  const fallbackProjectColor = projects.length === 1 ? projects[0]?.color : undefined;
  const appearance = useMemo(() => getTaskBarAppearance({
    fallbackProjectColor,
    priority: task.priority,
    projectColor: project?.color,
    status,
  }), [fallbackProjectColor, project?.color, status, task.priority]);
  const priorityMeta = task.priority && appearance.priorityVisual
    ? { ...appearance.priorityVisual, label: priorityLabels[task.priority] }
    : null;
  const showTooltip = isMobile
    ? mobileTooltipOpen
    : (isHovering && !isDragging && !isResizing);

  // Calculate vertical position based on lane
  const topPosition = ROW_TOP_PADDING + lane * (TASK_HEIGHT + TASK_GAP);

  const tooltipRafRef = useRef<number | null>(null);
  const tooltipPendingRef = useRef<{ clientX: number; clientY: number } | null>(null);

  useEffect(() => () => {
    if (tooltipRafRef.current !== null) {
      cancelAnimationFrame(tooltipRafRef.current);
      tooltipRafRef.current = null;
    }
    if (singleTapTimerRef.current !== null) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
  }, []);

  // Mobile: dismiss the tap-tooltip on the next touch outside it. Passive so the
  // same gesture still scrolls the timeline (no blocking full-screen backdrop).
  useEffect(() => {
    if (!isMobile || !mobileTooltipOpen) return undefined;
    const onDocTouch = (ev: TouchEvent) => {
      const target = ev.target as Node | null;
      if (tooltipElRef.current && target && tooltipElRef.current.contains(target)) return;
      setMobileTooltipOpen(false);
    };
    document.addEventListener('touchstart', onDocTouch, { passive: true });
    return () => document.removeEventListener('touchstart', onDocTouch);
  }, [isMobile, mobileTooltipOpen]);

  const updateTooltipPosition = useCallback((event: React.MouseEvent) => {
    tooltipPendingRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (tooltipRafRef.current !== null) return;
    tooltipRafRef.current = requestAnimationFrame(() => {
      tooltipRafRef.current = null;
      const pending = tooltipPendingRef.current;
      if (!pending) return;
      const offset = 14;
      const tooltipWidth = 260;
      const tooltipHeight = 180;
      const { innerWidth, innerHeight } = window;
      let x = pending.clientX + offset;
      let y = pending.clientY + offset;
      if (x + tooltipWidth > innerWidth) {
        x = Math.max(8, pending.clientX - tooltipWidth - offset);
      }
      if (y + tooltipHeight > innerHeight) {
        y = Math.max(8, pending.clientY - tooltipHeight - offset);
      }
      setTooltipPos({ x, y });
    });
  }, []);

  // Mobile: anchor the tooltip to the bar (touch has no cursor), clamped to the
  // viewport — below the bar, or above it when there isn't room.
  const positionMobileTooltip = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const tooltipWidth = 256;
    const tooltipHeight = 180;
    const offset = 8;
    let x = rect.left;
    if (x + tooltipWidth > window.innerWidth) {
      x = window.innerWidth - tooltipWidth - offset;
    }
    x = Math.max(8, x);
    let y = rect.bottom + offset;
    if (y + tooltipHeight > window.innerHeight) {
      y = Math.max(8, rect.top - tooltipHeight - offset);
    }
    setTooltipPos({ x, y });
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    // Drain the long-press latch at the start of every gesture so a previous
    // long-press that ended in a touchcancel can't swallow this tap.
    menuJustOpenedRef.current = false;
    tapStartRef.current = { x: touch.clientX, y: touch.clientY };
    tapMovedRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const start = tapStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch) return;
    if (
      Math.abs(touch.clientX - start.x) > TAP_MOVE_THRESHOLD
      || Math.abs(touch.clientY - start.y) > TAP_MOVE_THRESHOLD
    ) {
      tapMovedRef.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // A long-press already opened the context menu — swallow this touchend.
    if (menuJustOpenedRef.current) {
      menuJustOpenedRef.current = false;
      tapStartRef.current = null;
      return;
    }
    const start = tapStartRef.current;
    tapStartRef.current = null;
    if (!start || tapMovedRef.current) return; // a scroll/drag, not a tap
    // Suppress the synthetic mouse click that would otherwise follow the tap.
    e.preventDefault();
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      // Double tap → open the task detail.
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = 0;
      setMobileTooltipOpen(false);
      setSelectedTaskId(task.id);
      return;
    }
    // First tap → wait for a possible second tap; otherwise show the tooltip.
    lastTapRef.current = now;
    if (singleTapTimerRef.current !== null) {
      window.clearTimeout(singleTapTimerRef.current);
    }
    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      lastTapRef.current = 0;
      positionMobileTooltip();
      setMobileTooltipOpen(true);
    }, DOUBLE_TAP_MS);
  }, [task.id, setSelectedTaskId, positionMobileTooltip]);

  const handleMouseDown = useCallback((e: React.MouseEvent, resize?: 'left' | 'right') => {
    if (!canEdit) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (resize) {
      setIsResizing(resize);
    } else {
      setIsDragging(true);
    }

    dragStateRef.current = {
      startX: e.clientX,
      startScrollLeft: dragScroll.getScrollContainer()?.scrollLeft ?? 0,
      lastClientX: e.clientX,
      x: 0,
      moved: false,
    };
    setDragOffsetX(0);
  }, [canEdit, dragScroll]);

  const requestMoveTask = useCallback((startDate: string, endDate: string) => {
    if (!task.repeatId) {
      void moveTask(task.id, startDate, endDate, 'single');
      return;
    }

    setPendingRepeatMove({ startDate, endDate });
    setRepeatScopeOpen(true);
  }, [moveTask, task.id, task.repeatId]);

  const applyPendingRepeatMove = useCallback(async (scope: RepeatTaskUpdateScope) => {
    const pendingMove = pendingRepeatMove;
    if (!pendingMove) return;
    setPendingRepeatMove(null);
    setRepeatScopeOpen(false);
    if (scope === 'single') {
      // "Only this task" detaches the occurrence from its series (repeatId: null)
      // so future moves/edits treat it as standalone and never ask for scope again.
      await moveTaskDetached(task.id, pendingMove.startDate, pendingMove.endDate);
      return;
    }
    await moveTask(task.id, pendingMove.startDate, pendingMove.endDate, scope);
  }, [moveTask, moveTaskDetached, pendingRepeatMove, task.id]);

  const cancelPendingRepeatMove = useCallback(() => {
    setPendingRepeatMove(null);
    setRepeatScopeOpen(false);
  }, []);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const container = dragScroll.getScrollContainer();

    // Recompute the bar offset from the latest mouse position and scroll.
    const syncOffset = () => {
      const state = dragStateRef.current;
      const scrollDelta = container ? container.scrollLeft - state.startScrollLeft : 0;
      state.x = (state.lastClientX - state.startX) + scrollDelta;
      setDragOffsetX(state.x);
    };

    const stopAutoScroll = () => {
      if (autoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
    };

    // Edge auto-scroll: while the cursor sits in a strip at either side of the
    // date area, push the container a little every frame. Stops by itself when
    // the cursor leaves the strip or the container runs out of range.
    const autoScrollTick = () => {
      autoScrollFrameRef.current = null;
      const state = dragStateRef.current;
      const bounds = dragScroll.getViewportBounds();
      if (!container || !bounds || !state.moved) return;
      const velocity = getEdgeScrollVelocity(state.lastClientX, bounds);
      dragScroll.setTaskDragState({
        active: true,
        edge: velocity < 0 ? 'left' : velocity > 0 ? 'right' : null,
      });
      if (velocity === 0) return;
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const next = Math.min(maxScroll, Math.max(0, container.scrollLeft + velocity));
      if (next === container.scrollLeft) return;
      container.scrollLeft = next;
      syncOffset();
      autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollTick);
    };

    const scheduleAutoScroll = () => {
      if (!container || autoScrollFrameRef.current !== null) return;
      autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollTick);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      state.lastClientX = e.clientX;
      if (!state.moved && Math.abs(e.clientX - state.startX) > 3) {
        state.moved = true;
        dragScroll.setTaskDragState({ active: true, edge: null });
      }
      syncOffset();
      if (state.moved) scheduleAutoScroll();
    };

    const handleMouseUp = () => {
      stopAutoScroll();
      const { x, moved } = dragStateRef.current;
      const daysDelta = computeDragDeltaDays(x, 0, dayWidth);

      if (daysDelta !== 0) {
        if (isResizing) {
          const { startDate, endDate } = calculateResizedDates(
            task.startDate,
            task.endDate,
            isResizing,
            daysDelta
          );
          requestMoveTask(startDate, endDate);
        } else {
          const { startDate, endDate } = calculateNewDates(
            task.startDate,
            task.endDate,
            daysDelta
          );
          requestMoveTask(startDate, endDate);
        }
      }

      // Only open panel on clean click (no movement)
      if (!moved && !isResizing) {
        setSelectedTaskId(task.id);
        if (isHighlighted) {
          setHighlightedTaskId(null);
        }
      }

      dragScroll.setTaskDragState({ active: false, edge: null });
      setIsDragging(false);
      setIsResizing(null);
      setDragOffsetX(0);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Wheel or trackpad scrolling mid-drag moves the grid under the bar too.
    container?.addEventListener('scroll', syncOffset);

    return () => {
      stopAutoScroll();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      container?.removeEventListener('scroll', syncOffset);
    };
  }, [
    isDragging,
    isResizing,
    dayWidth,
    dragScroll,
    requestMoveTask,
    task,
    isHighlighted,
    setHighlightedTaskId,
    setSelectedTaskId,
  ]);

  // A bar unmounted mid-drag (task deleted, row re-grouped) must not leave the
  // grid believing a drag is still on.
  useEffect(() => () => {
    if (dragStateRef.current.moved) {
      dragScroll.setTaskDragState({ active: false, edge: null });
    }
  }, [dragScroll]);

  // Calculate visual position during drag
  const visualLeft = useMemo(() => (
    isDragging || isResizing === 'left'
      ? position.left + dragOffsetX
      : position.left
  ), [isDragging, isResizing, position.left, dragOffsetX]);

  const visualWidth = useMemo(() => {
    if (isResizing === 'left') return position.width - dragOffsetX;
    if (isResizing === 'right') return position.width + dragOffsetX;
    return position.width;
  }, [isResizing, position.width, dragOffsetX]);

  const barStyle = useMemo(() => ({
    left: visualLeft,
    top: topPosition,
    width: Math.max(visualWidth, dayWidth - 4),
    height: TASK_HEIGHT,
    backgroundColor: appearance.backgroundColor,
    border: appearance.border,
  }), [visualLeft, topPosition, visualWidth, dayWidth, appearance.backgroundColor, appearance.border]);

  const handleRequestDelete = useCallback(() => {
    setDeleteMounted(true);
    setDeleteOpen(true);
  }, []);

  return (
    <ContextMenu
      onOpenChange={isMobile ? (open) => {
        if (open) {
          menuJustOpenedRef.current = true;
          // Long-press won the gesture: cancel any pending single-tap tooltip so
          // it can't flash during the hold, and drop the info tooltip.
          if (singleTapTimerRef.current !== null) {
            window.clearTimeout(singleTapTimerRef.current);
            singleTapTimerRef.current = null;
          }
          lastTapRef.current = 0;
          setMobileTooltipOpen(false);
        } else {
          // Menu closed: clear the latch so it can't swallow a later tap.
          menuJustOpenedRef.current = false;
        }
      } : undefined}
    >
      <ContextMenuTrigger asChild>
        <div
          ref={barRef}
          data-task-id={task.id}
          data-row-assignee-id={rowAssigneeId ?? undefined}
          onMouseDown={isMobile ? undefined : (e) => handleMouseDown(e)}
          onMouseEnter={isMobile ? undefined : (e) => {
            setIsHovering(true);
            updateTooltipPosition(e);
          }}
          onMouseMove={isMobile ? undefined : updateTooltipPosition}
          onMouseLeave={isMobile ? undefined : () => setIsHovering(false)}
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchMove={isMobile ? handleTouchMove : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
          onClick={isMobile ? undefined : (e) => {
            e.stopPropagation();
            if (!canEdit) {
              setSelectedTaskId(task.id);
              if (isHighlighted) {
                setHighlightedTaskId(null);
              }
            }
          }}
          className={cn(
            'task-bar absolute flex flex-col justify-center px-2 py-0.5 overflow-hidden select-none pointer-events-auto',
            isDragging && 'dragging z-50',
            isResizing && 'z-50',
            isSelected && 'ring-2 ring-primary ring-offset-1',
            isHighlighted && 'task-highlight z-40',
            appearance.isCancelled && 'opacity-60 saturate-50'
          )}
          style={barStyle}
        >
          {/* Left resize handle */}
          {!isMobile && (
            <div
              className="resize-handle left-0 hover:bg-black/20"
              onMouseDown={(e) => handleMouseDown(e, 'left')}
            />
          )}

          {/* Task content */}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2 min-w-0">
              {status?.emoji && (
                <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-sm leading-none">
                  {status.emoji}
                </span>
              )}
              {appearance.isCancelled && (
                <Ban className="h-3 w-3 text-red-500" aria-label={t`Cancelled`} />
              )}
              {isRepeating && (
                <RotateCw
                  className="h-3 w-3 shrink-0 opacity-80"
                  style={{ color: appearance.textColor }}
                  aria-label={t`Repeat`}
                />
              )}
              {priorityMeta && (
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                  style={priorityMeta.badgeStyle}
                  title={priorityMeta.label}
                  aria-label={priorityMeta.label}
                >
                  <span className={cn('text-[11px] font-black leading-none priority-blink', priorityMeta.className)}>
                    {priorityMeta.symbol}
                  </span>
                </span>
              )}
              <span
                className={cn('task-label text-sm font-semibold leading-tight truncate', appearance.isCompleted && 'line-through')}
                style={{ color: appearance.textColor }}
              >
                {task.title}
              </span>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="text-[11px] leading-tight truncate"
                style={{ color: appearance.secondaryTextColor }}
              >
                {project ? formatProjectLabel(project.name, project.code) : t`No project`}
              </span>
              {commentCount > 0 && (
                <span
                  className="flex shrink-0 items-center gap-0.5 text-[9px] leading-none opacity-70"
                  style={{ color: appearance.secondaryTextColor }}
                >
                  <MessageSquare className="h-2.5 w-2.5" />
                  {commentCount}
                </span>
              )}
            </div>
          </div>

          {/* Right resize handle */}
          {!isMobile && (
            <div
              className="resize-handle right-0 hover:bg-black/20"
              onMouseDown={(e) => handleMouseDown(e, 'right')}
            />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className={cn(isMobile && 'min-w-[232px] rounded-2xl p-1.5')}>
        {/* Radix only mounts ContextMenuContent's children while the menu is
            open, so TaskBarMenu's heavy subscriptions/computations are deferred
            to the single bar whose menu is actually open. */}
        <TaskBarMenu task={task} canEdit={canEdit} onRequestDelete={handleRequestDelete} isMobile={isMobile} />
      </ContextMenuContent>
      {showTooltip && typeof document !== 'undefined' && createPortal(
        <div
          ref={tooltipElRef}
          className="fixed z-50 w-64 max-w-xs rounded-lg border bg-background p-3 shadow-xl"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground leading-snug break-words">
              {task.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDateRange(task.startDate, task.endDate, dateLocale)}
            </div>
            {isRepeating && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <RotateCw className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{t`Repeat`}</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {t`Assignees`}: <span className="text-foreground font-medium">{assigneeLabel}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {t`Project`}: <span className="text-foreground font-medium">
                {project ? formatProjectLabel(project.name, project.code) : t`No project`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {status && (
                <Badge className="text-[10px]" variant="outline">
                  {formatStatusLabel(status.name, status.emoji)}
                </Badge>
              )}
              {taskType && (
                <Badge className="text-[10px]" variant="secondary">
                  {taskType.name}
                </Badge>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      {deleteMounted && (
        <TaskBarDeleteDialog
          task={task}
          canEdit={canEdit}
          rowAssigneeId={rowAssigneeId}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
      <RepeatTaskScopeDialog
        open={repeatScopeOpen}
        onOpenChange={setRepeatScopeOpen}
        onCancel={cancelPendingRepeatMove}
        onApply={applyPendingRepeatMove}
      />
    </ContextMenu>
  );
};

const areTaskBarPropsEqual = (prev: TaskBarProps, next: TaskBarProps) => (
  prev.task === next.task
  && prev.position.left === next.position.left
  && prev.position.width === next.position.width
  && prev.dayWidth === next.dayWidth
  && prev.visibleDays === next.visibleDays
  && prev.lane === next.lane
  && prev.canEdit === next.canEdit
  && prev.rowAssigneeId === next.rowAssigneeId
);

export const TaskBar = React.memo(TaskBarBase, areTaskBarPropsEqual);
TaskBar.displayName = 'TaskBar';
