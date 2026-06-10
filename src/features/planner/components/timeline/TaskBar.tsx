import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { RepeatTaskUpdateScope, Task, TaskPriority } from '@/features/planner/types/planner';
import { RepeatTaskScopeDialog } from '@/features/planner/components/RepeatTaskScopeDialog';
import { cn } from '@/shared/lib/classNames';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { calculateNewDates, calculateResizedDates, formatDateRange, TASK_HEIGHT, TASK_GAP, ROW_TOP_PADDING } from '@/features/planner/lib/dateUtils';
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
import { TaskBarMenu } from './TaskBarMenu';
import { TaskBarDeleteDialog } from './TaskBarDeleteDialog';

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
  const updateTask = usePlannerStore((state) => state.updateTask);
  const setSelectedTaskId = usePlannerStore((state) => state.setSelectedTaskId);
  const setHighlightedTaskId = usePlannerStore((state) => state.setHighlightedTaskId);
  // Boolean selectors: this bar only re-renders when ITS own selected/
  // highlighted state flips, not on every selection change across the board.
  const isSelected = usePlannerStore((state) => state.selectedTaskId === task.id);
  const isHighlighted = usePlannerStore((state) => state.highlightedTaskId === task.id);
  const commentCount = usePlannerStore((state) => state.taskCommentCounts?.[task.id] ?? 0);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, startX: 0 });
  const [hasMoved, setHasMoved] = useState(false);
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
  const showTooltip = isHovering && !isDragging && !isResizing;

  // Calculate vertical position based on lane
  const topPosition = ROW_TOP_PADDING + lane * (TASK_HEIGHT + TASK_GAP);

  const tooltipRafRef = useRef<number | null>(null);
  const tooltipPendingRef = useRef<{ clientX: number; clientY: number } | null>(null);

  useEffect(() => () => {
    if (tooltipRafRef.current !== null) {
      cancelAnimationFrame(tooltipRafRef.current);
      tooltipRafRef.current = null;
    }
  }, []);

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

  const handleMouseDown = useCallback((e: React.MouseEvent, resize?: 'left' | 'right') => {
    if (!canEdit) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    setHasMoved(false);

    if (resize) {
      setIsResizing(resize);
    } else {
      setIsDragging(true);
    }

    setDragOffset({ x: 0, startX: e.clientX });
  }, [canEdit]);

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
      await updateTask(
        task.id,
        { startDate: pendingMove.startDate, endDate: pendingMove.endDate, repeatId: null },
        'single',
      );
      return;
    }
    await moveTask(task.id, pendingMove.startDate, pendingMove.endDate, scope);
  }, [moveTask, updateTask, pendingRepeatMove, task.id]);

  const cancelPendingRepeatMove = useCallback(() => {
    setPendingRepeatMove(null);
    setRepeatScopeOpen(false);
  }, []);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragOffset.startX;
      if (Math.abs(deltaX) > 3) {
        setHasMoved(true);
      }
      setDragOffset(prev => ({ ...prev, x: deltaX }));
    };

    const handleMouseUp = () => {
      const daysDelta = Math.round(dragOffset.x / dayWidth);

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
      if (!hasMoved && !isResizing) {
        setSelectedTaskId(task.id);
        if (isHighlighted) {
          setHighlightedTaskId(null);
        }
      }

      setIsDragging(false);
      setIsResizing(null);
      setDragOffset({ x: 0, startX: 0 });
      setHasMoved(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    isResizing,
    dragOffset.startX,
    dragOffset.x,
    dayWidth,
    requestMoveTask,
    task,
    hasMoved,
    isHighlighted,
    setHighlightedTaskId,
    setSelectedTaskId,
  ]);

  // Calculate visual position during drag
  const visualLeft = useMemo(() => (
    isDragging || isResizing === 'left'
      ? position.left + dragOffset.x
      : position.left
  ), [isDragging, isResizing, position.left, dragOffset.x]);

  const visualWidth = useMemo(() => {
    if (isResizing === 'left') return position.width - dragOffset.x;
    if (isResizing === 'right') return position.width + dragOffset.x;
    return position.width;
  }, [isResizing, position.width, dragOffset.x]);

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
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={barRef}
          data-task-id={task.id}
          data-row-assignee-id={rowAssigneeId ?? undefined}
          onMouseDown={(e) => handleMouseDown(e)}
          onMouseEnter={(e) => {
            setIsHovering(true);
            updateTooltipPosition(e);
          }}
          onMouseMove={updateTooltipPosition}
          onMouseLeave={() => setIsHovering(false)}
          onClick={(e) => {
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
          <div
            className="resize-handle left-0 hover:bg-black/20"
            onMouseDown={(e) => handleMouseDown(e, 'left')}
          />

          {/* Task content */}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2 min-w-0">
              {status?.emoji && (
                <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-sm leading-none">
                  {status.emoji}
                </span>
              )}
              {appearance.isCancelled && (
                <Ban className="h-3 w-3 text-red-500" aria-label={t`Cancelled`} title={t`Cancelled`} />
              )}
              {isRepeating && (
                <RotateCw
                  className="h-3 w-3 shrink-0 opacity-80"
                  style={{ color: appearance.textColor }}
                  aria-label={t`Repeat`}
                  title={t`Repeat`}
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
          <div
            className="resize-handle right-0 hover:bg-black/20"
            onMouseDown={(e) => handleMouseDown(e, 'right')}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {/* Radix only mounts ContextMenuContent's children while the menu is
            open, so TaskBarMenu's heavy subscriptions/computations are deferred
            to the single bar whose menu is actually open. */}
        <TaskBarMenu task={task} canEdit={canEdit} onRequestDelete={handleRequestDelete} />
      </ContextMenuContent>
      {showTooltip && typeof document !== 'undefined' && createPortal(
        <div
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
