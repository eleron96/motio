import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { RepeatTaskUpdateScope, Task, TaskPriority } from '@/features/planner/types/planner';
import { RepeatTaskScopeDialog } from '@/features/planner/components/RepeatTaskScopeDialog';
import { cn } from '@/shared/lib/classNames';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { calculateNewDates, calculateResizedDates, formatDateRange, TASK_HEIGHT, TASK_GAP } from '@/features/planner/lib/dateUtils';
import { getTaskBarAppearance } from '@/features/planner/lib/taskBarColors';
import { Ban, MessageSquare, RotateCw } from 'lucide-react';
import { t } from '@lingui/macro';
import { useLocaleStore } from '@/shared/store/localeStore';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { Badge } from '@/shared/ui/badge';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';

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
  const tasks = usePlannerStore((state) => state.tasks);
  const projects = usePlannerStore((state) => state.projects);
  const trackedProjectIds = usePlannerStore((state) => state.trackedProjectIds);
  const statuses = usePlannerStore((state) => state.statuses);
  const taskTypes = usePlannerStore((state) => state.taskTypes);
  const assignees = usePlannerStore((state) => state.assignees);
  const moveTask = usePlannerStore((state) => state.moveTask);
  const updateTask = usePlannerStore((state) => state.updateTask);
  const removeAssigneeFromTask = usePlannerStore((state) => state.removeAssigneeFromTask);
  const deleteTask = usePlannerStore((state) => state.deleteTask);
  const deleteTaskSeries = usePlannerStore((state) => state.deleteTaskSeries);
  const duplicateTask = usePlannerStore((state) => state.duplicateTask);
  const setSelectedTaskId = usePlannerStore((state) => state.setSelectedTaskId);
  const selectedTaskId = usePlannerStore((state) => state.selectedTaskId);
  const highlightedTaskId = usePlannerStore((state) => state.highlightedTaskId);
  const setHighlightedTaskId = usePlannerStore((state) => state.setHighlightedTaskId);
  const groupMode = usePlannerStore((state) => state.groupMode);
  const commentCount = usePlannerStore((state) => state.taskCommentCounts?.[task.id] ?? 0);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, startX: 0 });
  const [hasMoved, setHasMoved] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForRowAssigneeOnly, setDeleteForRowAssigneeOnly] = useState(false);
  const [pendingRepeatMove, setPendingRepeatMove] = useState<PendingRepeatMove | null>(null);
  const [repeatScopeOpen, setRepeatScopeOpen] = useState(false);
  const [projectSubOpen, setProjectSubOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null);
  
  const barRef = useRef<HTMLDivElement>(null);
  
  const project = projects.find(p => p.id === task.projectId);
  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((item) => !item.archived),
      trackedProjectIds,
    ),
    [projects, trackedProjectIds],
  );
  const archivedProject = project?.archived ? project : null;
  const projectOptions = useMemo(() => {
    if (!archivedProject) return activeProjects;
    return [archivedProject, ...activeProjects.filter((item) => item.id !== archivedProject.id)];
  }, [activeProjects, archivedProject]);
  const status = statuses.find(s => s.id === task.statusId);
  const taskType = taskTypes.find(t => t.id === task.typeId);
  const assignedAssignees = assignees.filter((assignee) => task.assigneeIds.includes(assignee.id));
  const scopedAssignee = useMemo(() => {
    if (!rowAssigneeId) return null;
    if (!task.assigneeIds.includes(rowAssigneeId)) return null;
    return assignees.find((assignee) => assignee.id === rowAssigneeId) ?? null;
  }, [assignees, rowAssigneeId, task.assigneeIds]);
  const scopedDeleteAvailable = Boolean(scopedAssignee);
  const scopedAssigneeName = scopedAssignee?.name ?? t`Unknown user`;
  const assigneeLabel = assignedAssignees.length === 0
    ? t`Unassigned`
    : assignedAssignees.map((assignee) => assignee.name).join(', ');
  const isSelected = selectedTaskId === task.id;
  const isHighlighted = highlightedTaskId === task.id;
  const priorityLabels: Record<TaskPriority, string> = {
    low: t`Low priority`,
    medium: t`Medium priority`,
    high: t`High priority`,
  };
  const isRepeating = Boolean(task.repeatId);
  const hasFutureRepeats = isRepeating
    ? tasks.some((item) => item.repeatId === task.repeatId && item.startDate > task.startDate)
    : false;
  const noProjectDisabled = groupMode === 'project';
  
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
  const topPosition = lane * (TASK_HEIGHT + TASK_GAP);

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
    await moveTask(task.id, pendingMove.startDate, pendingMove.endDate, scope);
  }, [moveTask, pendingRepeatMove, task.id]);

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

  const handleStatusChange = (statusId: string) => {
    if (!canEdit || statusId === task.statusId) return;
    updateTask(task.id, { statusId });
  };

  const handleProjectChange = (projectId: string) => {
    if (!canEdit) return;
    if (noProjectDisabled && projectId === 'none') return;
    const nextProjectId = projectId === 'none' ? null : projectId;
    if (nextProjectId === task.projectId) return;
    updateTask(task.id, { projectId: nextProjectId });
  };

  const projectValue = task.projectId ?? 'none';

  const filteredProjectOptions = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return projectOptions;
    return projectOptions.filter((item) => {
      const name = item.name?.toLowerCase() ?? '';
      const code = item.code?.toLowerCase() ?? '';
      return name.includes(query) || code.includes(query);
    });
  }, [projectOptions, projectQuery]);

  useEffect(() => {
    if (!projectSubOpen) setProjectQuery('');
  }, [projectSubOpen]);

  const priorityValue = task.priority ?? 'none';
  const handlePriorityChange = (value: string) => {
    if (!canEdit) return;
    const nextPriority: TaskPriority | null = value === 'none'
      ? null
      : (value as TaskPriority);
    if (nextPriority === (task.priority ?? null)) return;
    updateTask(task.id, { priority: nextPriority });
  };

  useEffect(() => {
    if (!deleteOpen) {
      setDeleteForRowAssigneeOnly(false);
    }
  }, [deleteOpen, task.id]);

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
        <ContextMenuSub>
          <ContextMenuSubTrigger className="py-1 text-xs">{t`Status`}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuLabel className="px-2 py-1 text-xs">{t`Status`}</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuRadioGroup value={task.statusId} onValueChange={handleStatusChange}>
              {statuses.map((item) => (
                <ContextMenuRadioItem key={item.id} value={item.id} disabled={!canEdit} className="py-1 pl-7 text-xs">
                  {formatStatusLabel(item.name, item.emoji)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={() => duplicateTask(task.id)} disabled={!canEdit} className="py-1 text-xs">
          {t`Duplicate task`}
        </ContextMenuItem>
        <ContextMenuSub open={projectSubOpen} onOpenChange={setProjectSubOpen}>
          <ContextMenuSubTrigger className="py-1 text-xs">{t`Assign project`}</ContextMenuSubTrigger>
          <ContextMenuSubContent
            className="w-64 p-1"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() => {
                projectSearchInputRef.current?.focus();
                projectSearchInputRef.current?.select();
              });
            }}
          >
            <div className="px-1 pb-1">
              <Input
                ref={projectSearchInputRef}
                value={projectQuery}
                onChange={(event) => setProjectQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Prevent Radix typeahead/arrow-nav from stealing keystrokes.
                  if (event.key !== 'Escape' && event.key !== 'Tab') {
                    event.stopPropagation();
                  }
                }}
                placeholder={t`Search projects`}
                className="h-7 text-xs"
              />
            </div>
            <ContextMenuSeparator />
            <div className="max-h-64 overflow-y-auto">
              <ContextMenuRadioGroup value={projectValue} onValueChange={handleProjectChange}>
                <ContextMenuRadioItem
                  value="none"
                  disabled={!canEdit || noProjectDisabled}
                  className="py-1 pl-7 text-xs"
                >
                  {t`No project`}
                </ContextMenuRadioItem>
                {filteredProjectOptions.map((item) => (
                  <ContextMenuRadioItem
                    key={item.id}
                    value={item.id}
                    disabled={!canEdit}
                    className="py-1 pl-7 text-xs"
                  >
                    <span
                      className="mr-1.5 inline-flex h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">{formatProjectLabel(item.name, item.code)}</span>
                    {item.archived && (
                      <span className="ml-1 text-[10px] text-muted-foreground">({t`Archived`})</span>
                    )}
                  </ContextMenuRadioItem>
                ))}
                {filteredProjectOptions.length === 0 && (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {t`No matches`}
                  </div>
                )}
              </ContextMenuRadioGroup>
            </div>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="py-1 text-xs">{t`Priority`}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuLabel className="px-2 py-1 text-xs">{t`Priority`}</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuRadioGroup value={priorityValue} onValueChange={handlePriorityChange}>
              <ContextMenuRadioItem value="none" disabled={!canEdit} className="py-1 pl-7 text-xs">
                {t`No priority`}
              </ContextMenuRadioItem>
              <ContextMenuRadioItem value="low" disabled={!canEdit} className="py-1 pl-7 text-xs">
                {priorityLabels.low}
              </ContextMenuRadioItem>
              <ContextMenuRadioItem value="medium" disabled={!canEdit} className="py-1 pl-7 text-xs">
                {priorityLabels.medium}
              </ContextMenuRadioItem>
              <ContextMenuRadioItem value="high" disabled={!canEdit} className="py-1 pl-7 text-xs">
                {priorityLabels.high}
              </ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => setDeleteOpen(true)} disabled={!canEdit} className="py-1 text-xs text-destructive">
          {t`Delete task`}
        </ContextMenuItem>
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
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isRepeating ? t`Delete repeated task?` : t`Delete task?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteForRowAssigneeOnly && scopedDeleteAvailable
                ? (isRepeating
                  ? t`Remove "${scopedAssigneeName}" from this task or from this and following repeats.`
                  : t`Remove "${scopedAssigneeName}" from this task only.`)
                : (isRepeating
                  ? (hasFutureRepeats
                    ? t`Delete only this task or this and future repeats? Previous repeats stay.`
                    : t`Delete only this task or this and subsequent repeats? Previous repeats stay.`)
                  : t`This will permanently delete "${task.title}".`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {scopedDeleteAvailable && (
            <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox
                checked={deleteForRowAssigneeOnly}
                onCheckedChange={(value) => setDeleteForRowAssigneeOnly(value === true)}
              />
              <span>{t`Only for ${scopedAssigneeName}`}</span>
            </label>
          )}
          <AlertDialogFooter className="flex-row flex-wrap items-center justify-end gap-2 sm:space-x-0">
            <AlertDialogCancel className="mt-0 h-8 px-2.5 text-xs">{t`Cancel`}</AlertDialogCancel>
            {isRepeating ? (
              <>
                <AlertDialogAction
                  className="h-8 whitespace-nowrap bg-muted px-2.5 text-xs text-foreground hover:bg-muted/80"
                  onClick={async () => {
                    if (!canEdit) return;
                    if (deleteForRowAssigneeOnly && scopedAssignee) {
                      await removeAssigneeFromTask(task.id, scopedAssignee.id, 'single');
                    } else {
                      await deleteTask(task.id);
                    }
                    setDeleteOpen(false);
                  }}
                >
                  {t`Delete this`}
                </AlertDialogAction>
                <AlertDialogAction
                  className="h-8 whitespace-nowrap bg-destructive px-2.5 text-xs text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    if (!canEdit || !task.repeatId) return;
                    if (deleteForRowAssigneeOnly && scopedAssignee) {
                      await removeAssigneeFromTask(task.id, scopedAssignee.id, 'following');
                    } else {
                      await deleteTaskSeries(task.repeatId, task.startDate);
                    }
                    setDeleteOpen(false);
                  }}
                >
                  {t`Delete this & following`}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                className="h-8 whitespace-nowrap px-2.5 text-xs"
                onClick={async () => {
                  if (!canEdit) return;
                  if (deleteForRowAssigneeOnly && scopedAssignee) {
                    await removeAssigneeFromTask(task.id, scopedAssignee.id, 'single');
                  } else {
                    await deleteTask(task.id);
                  }
                  setDeleteOpen(false);
                }}
              >
                {t`Delete`}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
