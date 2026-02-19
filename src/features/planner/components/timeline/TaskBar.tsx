import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { Task, TaskPriority } from '@/features/planner/types/planner';
import { cn } from '@/shared/lib/classNames';
import { formatStatusLabel, stripStatusEmoji } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { calculateNewDates, calculateResizedDates, formatDateRange, TASK_HEIGHT, TASK_GAP } from '@/features/planner/lib/dateUtils';
import { Ban, RotateCw } from 'lucide-react';
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

const normalizeHex = (color: string) => {
  const raw = color.startsWith('#') ? color.slice(1) : color;
  if (raw.length === 3) {
    return raw.split('').map((char) => `${char}${char}`).join('');
  }
  if (raw.length === 6) {
    return raw;
  }
  return null;
};

const isDarkColor = (color: string) => {
  const hex = normalizeHex(color);
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    return false;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
};

const hexToRgba = (color: string, alpha: number) => {
  const hex = normalizeHex(color);
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getBadgeStyle = (color?: string) => {
  if (!color) return undefined;
  const background = hexToRgba(color, 0.18);
  const border = hexToRgba(color, 0.45);
  const text = isDarkColor(color) ? color : '#0f172a';
  if (!background || !border) return undefined;
  return { backgroundColor: background, borderColor: border, color: text };
};

const priorityStyles: Record<TaskPriority, { className: string; color: string }> = {
  low: { className: 'text-emerald-600', color: '#16a34a' },
  medium: { className: 'text-amber-500', color: '#f59e0b' },
  high: { className: 'text-red-600', color: '#dc2626' },
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
  const {
    tasks,
    projects,
    trackedProjectIds,
    statuses,
    taskTypes,
    assignees,
    moveTask,
    updateTask,
    removeAssigneeFromTask,
    deleteTask,
    deleteTaskSeries,
    duplicateTask,
    setSelectedTaskId,
    selectedTaskId,
    highlightedTaskId,
    setHighlightedTaskId,
    groupMode,
  } = usePlannerStore();
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, startX: 0 });
  const [hasMoved, setHasMoved] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForRowAssigneeOnly, setDeleteForRowAssigneeOnly] = useState(false);
  
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
  const priorityMeta = task.priority
    ? { ...priorityStyles[task.priority], label: priorityLabels[task.priority] }
    : null;
  const isCancelled = status
    ? (status.isCancelled
      ?? ['отменена', 'cancelled', 'canceled'].includes(stripStatusEmoji(status.name).trim().toLowerCase()))
    : false;
  const isRepeating = Boolean(task.repeatId);
  const hasFutureRepeats = isRepeating
    ? tasks.some((item) => item.repeatId === task.repeatId && item.startDate > task.startDate)
    : false;
  const noProjectDisabled = groupMode === 'project';
  
  const fallbackProjectColor = projects.length === 1 ? projects[0]?.color : undefined;
  const baseBgColor = project?.color || fallbackProjectColor || '#94a3b8';
  const isFinalStatus = Boolean(status?.isFinal);
  const isFinalStyle = isFinalStatus && !isCancelled;
  const bgColor = isFinalStyle ? '#ffffff' : baseBgColor;
  const isDarkBackground = isDarkColor(bgColor);
  const baseTextColor = isDarkBackground ? '#f8fafc' : '#14181F';
  const textColor = isFinalStyle ? '#64748b' : baseTextColor;
  const secondaryTextColor = isFinalStyle
    ? 'rgba(100,116,139,0.85)'
    : (isDarkBackground ? 'rgba(248,250,252,0.8)' : 'rgba(15,23,42,0.7)');
  const priorityBadgeStyle = priorityMeta
    ? {
        backgroundColor: '#ffffff',
        borderColor: priorityMeta.color,
        boxShadow: task.priority === 'high'
          ? `0 0 0 1px ${priorityMeta.color}, 0 0 8px ${hexToRgba(priorityMeta.color, 0.45) ?? priorityMeta.color}`
          : `0 0 0 1px ${priorityMeta.color}`,
      }
    : undefined;
  const prioritySymbol = task.priority === 'high' ? '‼' : '!';
  const isCompleted = isFinalStatus || isCancelled;
  const showTooltip = isHovering && !isDragging && !isResizing;
  
  // Calculate vertical position based on lane
  const topPosition = lane * (TASK_HEIGHT + TASK_GAP);

  const updateTooltipPosition = useCallback((event: React.MouseEvent) => {
    const offset = 14;
    const tooltipWidth = 260;
    const tooltipHeight = 180;
    const { innerWidth, innerHeight } = window;
    let x = event.clientX + offset;
    let y = event.clientY + offset;
    if (x + tooltipWidth > innerWidth) {
      x = Math.max(8, event.clientX - tooltipWidth - offset);
    }
    if (y + tooltipHeight > innerHeight) {
      y = Math.max(8, event.clientY - tooltipHeight - offset);
    }
    setTooltipPos({ x, y });
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
          moveTask(task.id, startDate, endDate);
        } else {
          const { startDate, endDate } = calculateNewDates(
            task.startDate,
            task.endDate,
            daysDelta
          );
          moveTask(task.id, startDate, endDate);
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
    task,
    moveTask,
    hasMoved,
    isHighlighted,
    setHighlightedTaskId,
    setSelectedTaskId,
  ]);

  // Calculate visual position during drag
  const visualLeft = isDragging || isResizing === 'left'
    ? position.left + dragOffset.x
    : position.left;
    
  const visualWidth = isResizing === 'left'
    ? position.width - dragOffset.x
    : isResizing === 'right'
    ? position.width + dragOffset.x
    : position.width;

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
            isCancelled && 'opacity-60 saturate-50'
          )}
          style={{
            left: visualLeft,
            top: topPosition,
            width: Math.max(visualWidth, dayWidth - 4),
            height: TASK_HEIGHT,
            backgroundColor: bgColor,
            border: isFinalStyle ? '1px solid #24342B' : 'none',
          }}
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
              {isCancelled && (
                <Ban className="h-3 w-3 text-red-500" aria-label={t`Cancelled`} title={t`Cancelled`} />
              )}
              {isRepeating && (
                <RotateCw
                  className="h-3 w-3 shrink-0 opacity-80"
                  style={{ color: textColor }}
                  aria-label={t`Repeat`}
                  title={t`Repeat`}
                />
              )}
              {priorityMeta && (
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                  style={priorityBadgeStyle}
                  title={priorityMeta.label}
                  aria-label={priorityMeta.label}
                >
                  <span className={cn('text-[11px] font-black leading-none priority-blink', priorityMeta.className)}>
                    {prioritySymbol}
                  </span>
                </span>
              )}
              <span
                className={cn('task-label text-sm font-semibold leading-tight truncate', isCompleted && 'line-through')}
                style={{ color: textColor }}
              >
                {task.title}
              </span>
            </div>
            <span
              className="text-[11px] leading-tight truncate"
              style={{ color: secondaryTextColor }}
            >
              {project ? formatProjectLabel(project.name, project.code) : t`No project`}
            </span>
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
          <ContextMenuSubTrigger>{t`Status`}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuLabel>{t`Status`}</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuRadioGroup value={task.statusId} onValueChange={handleStatusChange}>
              {statuses.map((item) => (
                <ContextMenuRadioItem key={item.id} value={item.id} disabled={!canEdit}>
                  <span className="mr-2 inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {formatStatusLabel(item.name, item.emoji)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={() => duplicateTask(task.id)} disabled={!canEdit}>
          {t`Duplicate task`}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t`Assign project`}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuLabel>{t`Project`}</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuRadioGroup value={projectValue} onValueChange={handleProjectChange}>
              <ContextMenuRadioItem value="none" disabled={!canEdit || noProjectDisabled}>
                {t`No project`}
              </ContextMenuRadioItem>
              {projectOptions.map((item) => (
                <ContextMenuRadioItem key={item.id} value={item.id} disabled={!canEdit}>
                  <span className="mr-2 inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {formatProjectLabel(item.name, item.code)}
                  {item.archived && (
                    <span className="ml-1 text-[10px] text-muted-foreground">({t`Archived`})</span>
                  )}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => setDeleteOpen(true)} disabled={!canEdit} className="text-destructive">
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
            <div className="flex flex-wrap gap-1">
              {status && (
                <Badge className="text-[10px]" style={getBadgeStyle(status.color)}>
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
