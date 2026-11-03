import React, { useCallback, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { selectSearchQueryForTitle, useTaskSearchStore } from '@/features/planner/store/taskSearchStore';
import { splitTitleAtMatch } from '@/shared/domain/taskSearch';
import { Task, TaskPriority } from '@/features/planner/types/planner';
import { RepeatTaskScopeDialog } from '@/features/planner/components/RepeatTaskScopeDialog';
import { cn } from '@/shared/lib/classNames';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { TASK_HEIGHT, TASK_GAP, ROW_TOP_PADDING } from '@/features/planner/lib/dateUtils';
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
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { TaskBarMenu } from './TaskBarMenu';
import { TaskBarDeleteDialog } from './TaskBarDeleteDialog';
import { TaskBarTooltip } from './TaskBarTooltip';
import { useTaskBarTooltip } from './hooks/useTaskBarTooltip';
import { useRepeatAwareMove } from './hooks/useRepeatAwareMove';
import { useTaskBarDrag } from './hooks/useTaskBarDrag';

interface TaskBarProps {
  task: Task;
  position: { left: number; width: number };
  dayWidth: number;
  visibleDays: Date[];
  lane: number;
  canEdit: boolean;
  rowAssigneeId?: string | null;
}

const TaskBarBase: React.FC<TaskBarProps> = ({
  task,
  position,
  dayWidth,
  lane,
  canEdit,
  rowAssigneeId = null,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  // Display-only slices. These arrays change rarely (project/status edits), so
  // subscribing here does NOT cause the per-bar re-render storms that
  // `tasks`/`selectedTaskId` used to — those were removed below. People and
  // task types are only named in the tooltip, which reads them itself.
  const projects = usePlannerStore((state) => state.projects);
  const statuses = usePlannerStore((state) => state.statuses);
  const setSelectedTaskId = usePlannerStore((state) => state.setSelectedTaskId);
  const setPeekedTaskId = usePlannerStore((state) => state.setPeekedTaskId);
  const setHighlightedTaskId = usePlannerStore((state) => state.setHighlightedTaskId);
  // Boolean selectors: this bar only re-renders when ITS own selected/
  // highlighted state flips, not on every selection change across the board.
  const isSelected = usePlannerStore((state) => state.selectedTaskId === task.id);
  const isHighlighted = usePlannerStore((state) => state.highlightedTaskId === task.id);
  const searchQuerySelector = useMemo(() => selectSearchQueryForTitle(task.title), [task.title]);
  const searchQuery = useTaskSearchStore(searchQuerySelector);
  const isSearchFocused = useTaskSearchStore((state) => state.open && state.focusedId === task.id);
  const titleParts = searchQuery ? splitTitleAtMatch(task.title, searchQuery) : null;
  const commentCount = usePlannerStore((state) => state.taskCommentCounts?.[task.id] ?? 0);

  const [deleteOpen, setDeleteOpen] = useState(false);
  // Mount the delete dialog only after it has been opened at least once, so its
  // `tasks`/`assignees` subscriptions stay dormant for bars never deleted. Once
  // mounted it stays mounted (driven by `open`) to preserve the close animation.
  const [deleteMounted, setDeleteMounted] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const {
    isHovering,
    setIsHovering,
    tooltipPos,
    mobileTooltipOpen,
    tooltipElRef,
    updateTooltipPosition,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleMenuOpenChange,
  } = useTaskBarTooltip({ isMobile, taskId: task.id, barRef, setSelectedTaskId, setPeekedTaskId });
  const {
    requestMoveTask,
    repeatScopeOpen,
    setRepeatScopeOpen,
    applyPendingRepeatMove,
    cancelPendingRepeatMove,
  } = useRepeatAwareMove(task);
  const { isDragging, isResizing, handleMouseDown, visualLeft, visualWidth } = useTaskBarDrag({
    task,
    position,
    dayWidth,
    canEdit,
    isHighlighted,
    setSelectedTaskId,
    setHighlightedTaskId,
    requestMoveTask,
  });

  const project = projects.find(p => p.id === task.projectId);
  const status = statuses.find(s => s.id === task.statusId);
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
    <ContextMenu onOpenChange={isMobile ? handleMenuOpenChange : undefined}>
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
            titleParts && 'task-search-match',
            isSearchFocused && 'task-search-focus',
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
                {titleParts ? (
                  <>
                    {titleParts[0]}
                    <mark className="task-search-hit">{titleParts[1]}</mark>
                    {titleParts[2]}
                  </>
                ) : task.title}
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
      {showTooltip && typeof document !== 'undefined' && (
        <TaskBarTooltip
          task={task}
          project={project}
          status={status}
          isRepeating={isRepeating}
          dateLocale={dateLocale}
          position={tooltipPos}
          containerRef={tooltipElRef}
        />
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
