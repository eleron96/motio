import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { TaskDetailAlerts, TaskNotFoundDialog } from '@/features/planner/components/TaskDetailDialogs';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { RichTextEditor } from '@/features/planner/components/RichTextEditor';
import { Label } from '@/shared/ui/label';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { cn } from '@/shared/lib/classNames';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Badge } from '@/shared/ui/badge';
import { supabase } from '@/shared/lib/supabaseClient';
import { AlertTriangle, ChevronDown, CircleDot, Layers, Plus, RotateCw, Trash2, User, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { RepeatTaskUpdateScope, Task, TaskPriority, TaskSubtask } from '@/features/planner/types/planner';
import { useAuthStore } from '@/features/auth/store/authStore';
import { addDays, endOfMonth, format, isSameMonth, isSameYear, parseISO } from 'date-fns';
import { t } from '@lingui/macro';

const areArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const normalizeProjectQuery = (value: string) => value.trim().toLowerCase();

const areTasksEqual = (left: Task, right: Task) => (
  left.title === right.title &&
  left.projectId === right.projectId &&
  areArraysEqual(left.assigneeIds, right.assigneeIds) &&
  left.statusId === right.statusId &&
  left.typeId === right.typeId &&
  left.priority === right.priority &&
  left.startDate === right.startDate &&
  left.endDate === right.endDate &&
  left.description === right.description &&
  areArraysEqual(left.tagIds, right.tagIds)
);

const shouldIgnoreOutsideInteraction = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('[data-radix-popper-content-wrapper]'));
};

type PendingRepeatUpdate = {
  taskId: string;
  updates: Partial<Task>;
  resetDraftOnCancel: boolean;
};

type TaskSubtaskRow = {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  done_at: string | null;
  position: number;
  created_at: string;
};

type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
type RepeatEnds = 'never' | 'on' | 'after';

const buildRepeatConfigSignature = (params: {
  frequency: RepeatFrequency;
  ends: RepeatEnds;
  until: string;
  count: number;
}) => (
  `${params.frequency}|${params.ends}|${params.ends === 'on' ? params.until : ''}|${params.ends === 'after' ? params.count : ''}`
);

const hasTaskUpdates = (task: Task, updates: Partial<Task>) => (
  Object.entries(updates).some(([key, value]) => {
    const currentValue = task[key as keyof Task];
    if (Array.isArray(currentValue) && Array.isArray(value)) {
      return !areArraysEqual(currentValue, value);
    }
    return currentValue !== value;
  })
);

const mapSubtaskRow = (row: TaskSubtaskRow): TaskSubtask => ({
  id: row.id,
  taskId: row.task_id,
  title: row.title,
  isDone: row.is_done,
  doneAt: row.done_at,
  position: row.position,
});

const inferRepeatFrequency = (series: Task[]): RepeatFrequency => {
  if (series.length < 2) return 'none';
  const sorted = [...series].sort((left, right) => left.startDate.localeCompare(right.startDate));
  const firstDate = parseISO(sorted[0].startDate);
  const secondDate = parseISO(sorted[1].startDate);
  const dayDiff = Math.abs(Math.round((secondDate.getTime() - firstDate.getTime()) / 86400000));
  if (dayDiff === 1) return 'daily';
  if (dayDiff === 7) return 'weekly';
  if (dayDiff === 14) return 'biweekly';
  if (dayDiff >= 28 && dayDiff <= 31) return 'monthly';
  if (dayDiff >= 364 && dayDiff <= 366) return 'yearly';
  return 'none';
};

export const TaskDetailPanel: React.FC = () => {
  const { 
    selectedTaskId, 
    setSelectedTaskId, 
    tasks, 
    projects, 
    trackedProjectIds,
    customers,
    assignees, 
    statuses, 
    taskTypes, 
    tags,
    groupMode,
    updateTask,
    deleteTask,
    deleteTaskSeries,
    duplicateTask,
    createRepeats,
  } = usePlannerStore();
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const canEdit = currentWorkspaceRole === 'editor' || currentWorkspaceRole === 'admin';
  const isReadOnly = !canEdit;
  const filteredAssignees = useFilteredAssignees(assignees);
  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => !project.archived),
      trackedProjectIds,
    ),
    [projects, trackedProjectIds],
  );
  const customerById = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers],
  );

  const originalTaskRef = useRef<Task | null>(null);
  const repeatInFlightRef = useRef(false);
  const repeatUntilAutoRef = useRef(true);
  const repeatConfigSnapshotRef = useRef('');
  const titleDraftRef = useRef('');
  const descriptionDraftRef = useRef('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('none');
  const [repeatEnds, setRepeatEnds] = useState<RepeatEnds>('never');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [repeatCount, setRepeatCount] = useState(4);
  const [repeatError, setRepeatError] = useState('');
  const [repeatNotice, setRepeatNotice] = useState('');
  const [repeatCreating, setRepeatCreating] = useState(false);
  const [repeatScopeOpen, setRepeatScopeOpen] = useState(false);
  const [pendingRepeatUpdate, setPendingRepeatUpdate] = useState<PendingRepeatUpdate | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [subtasksSaving, setSubtasksSaving] = useState(false);
  const [subtasksError, setSubtasksError] = useState('');
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement | null>(null);
  
  const task = tasks.find(t => t.id === selectedTaskId);
  const taskId = task?.id ?? null;
  const currentProject = useMemo(
    () => projects.find((project) => project.id === task?.projectId),
    [projects, task?.projectId],
  );
  const archivedProject = currentProject?.archived ? currentProject : null;
  const projectOptions = useMemo(() => {
    if (!archivedProject) return activeProjects;
    return [archivedProject, ...activeProjects.filter((project) => project.id !== archivedProject.id)];
  }, [activeProjects, archivedProject]);
  const currentProjectCustomer = currentProject?.customerId
    ? customerById.get(currentProject.customerId)
    : null;
  const selectableAssignees = useMemo(() => {
    if (!task) return filteredAssignees.filter((assignee) => assignee.isActive);
    return filteredAssignees.filter(
      (assignee) => assignee.isActive || task.assigneeIds.includes(assignee.id),
    );
  }, [filteredAssignees, task]);
  const noProjectDisabled = groupMode === 'project';
  const filteredProjectOptions = useMemo(() => {
    const query = normalizeProjectQuery(projectQuery);
    if (!query) return projectOptions;
    return projectOptions.filter((project) => (
      project.name.toLowerCase().includes(query)
      || (project.code ?? '').toLowerCase().includes(query)
    ));
  }, [projectOptions, projectQuery]);

  const handleProjectSelectOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setProjectQuery('');
    }
  }, []);

  const handleProjectSelectKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.isComposing) return;

    if (event.key === 'Backspace') {
      if (!projectQuery) return;
      event.preventDefault();
      event.stopPropagation();
      setProjectQuery((prev) => prev.slice(0, -1));
      return;
    }

    if (event.key === 'Escape' && projectQuery) {
      event.preventDefault();
      event.stopPropagation();
      setProjectQuery('');
      return;
    }

    const isPrintableKey = event.key.length === 1
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey;
    if (!isPrintableKey) return;

    event.preventDefault();
    event.stopPropagation();
    setProjectQuery((prev) => prev + event.key);
  }, [projectQuery]);

  useEffect(() => {
    if (!selectedTaskId) {
      originalTaskRef.current = null;
      return;
    }
    if (originalTaskRef.current?.id === selectedTaskId) return;
    if (task) {
      originalTaskRef.current = {
        ...task,
        assigneeIds: [...task.assigneeIds],
        tagIds: [...task.tagIds],
      };
    }
  }, [selectedTaskId, task]);

  useEffect(() => {
    if (!task) {
      titleDraftRef.current = '';
      descriptionDraftRef.current = '';
      setDraftTitle('');
      setDraftDescription('');
      return;
    }
    titleDraftRef.current = task.title;
    setDraftTitle(task.title);
    const nextDescription = task.description || '';
    descriptionDraftRef.current = nextDescription;
    setDraftDescription(nextDescription);
  }, [task]);

  useEffect(() => {
    setSubtasksOpen(false);
    setSubtasks([]);
    setNewSubtaskTitle('');
    setSubtasksError('');
    setSubtasksLoading(false);
    setSubtasksSaving(false);
    if (!taskId || !currentWorkspaceId) return;
    let active = true;

    const loadSubtasks = async () => {
      setSubtasksLoading(true);
      setSubtasksError('');
      const { data, error } = await supabase
        .from('task_subtasks')
        .select('id, task_id, title, is_done, done_at, position, created_at')
        .eq('workspace_id', currentWorkspaceId)
        .eq('task_id', taskId)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (!active) return;
      if (error) {
        setSubtasksError(error.message);
        setSubtasks([]);
        setSubtasksLoading(false);
        return;
      }

      const parsed = ((data ?? []) as TaskSubtaskRow[]).map(mapSubtaskRow);
      setSubtasks(parsed);
      setSubtasksOpen(parsed.length > 0);
      setSubtasksLoading(false);
    };

    void loadSubtasks();
    return () => {
      active = false;
    };
  }, [currentWorkspaceId, taskId]);

  const getDefaultRepeatUntil = (baseDate: string) => {
    const start = parseISO(baseDate);
    const next = addDays(start, 1);
    if (isSameMonth(next, start) && isSameYear(next, start)) {
      return format(next, 'yyyy-MM-dd');
    }
    return format(endOfMonth(start), 'yyyy-MM-dd');
  };

  useEffect(() => {
    if (!task) return;
    const defaultRepeatUntil = getDefaultRepeatUntil(task.startDate);
    const series = task.repeatId
      ? tasks.filter((item) => item.repeatId === task.repeatId)
      : [];
    const inferredFrequency = task.repeatId ? inferRepeatFrequency(series) : 'none';
    const lastSeriesDate = series.length > 0
      ? [...series].sort((left, right) => left.startDate.localeCompare(right.startDate))[series.length - 1].startDate
      : null;

    let nextFrequency: RepeatFrequency = 'none';
    let nextEnds: RepeatEnds = 'never';
    let nextCount = 4;
    let nextUntil = defaultRepeatUntil;

    if (task.repeatId && inferredFrequency !== 'none') {
      nextFrequency = inferredFrequency;
      if (series.length > 1) {
        nextEnds = 'after';
        nextCount = series.length;
      } else {
        nextEnds = 'never';
        nextCount = 4;
      }
      nextUntil = lastSeriesDate ?? defaultRepeatUntil;
    }

    setRepeatFrequency(nextFrequency);
    setRepeatEnds(nextEnds);
    setRepeatCount(nextCount);
    setRepeatUntil(nextUntil);
    repeatConfigSnapshotRef.current = buildRepeatConfigSignature({
      frequency: nextFrequency,
      ends: nextEnds,
      until: nextUntil,
      count: nextCount,
    });

    repeatUntilAutoRef.current = true;
    setRepeatError('');
    setRepeatNotice('');
    setRepeatCreating(false);
  }, [task, tasks]);

  useEffect(() => {
    if (selectedTaskId) return;
    setRepeatScopeOpen(false);
    setPendingRepeatUpdate(null);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!task) return;
    if (repeatFrequency === 'none' || repeatEnds !== 'on') return;
    if (!repeatUntilAutoRef.current) return;
    setRepeatUntil(getDefaultRepeatUntil(task.startDate));
  }, [repeatEnds, repeatFrequency, task]);

  const handleRepeatFrequencyChange = (value: typeof repeatFrequency) => {
    setRepeatFrequency(value);
    if (value === 'none') return;
    if (repeatEnds === 'on' && task) {
      repeatUntilAutoRef.current = true;
      setRepeatUntil(getDefaultRepeatUntil(task.startDate));
    }
  };

  const handleRepeatEndsChange = (value: typeof repeatEnds) => {
    setRepeatEnds(value);
    if (value !== 'on' || !task) return;
    repeatUntilAutoRef.current = true;
    setRepeatUntil(getDefaultRepeatUntil(task.startDate));
  };

  const isDirty = useMemo(() => {
    if (!task || !originalTaskRef.current) return false;
    return !areTasksEqual(originalTaskRef.current, task);
  }, [task]);
  const repeatConfigDirty = useMemo(() => (
    buildRepeatConfigSignature({
      frequency: repeatFrequency,
      ends: repeatEnds,
      until: repeatUntil,
      count: repeatCount,
    }) !== repeatConfigSnapshotRef.current
  ), [repeatCount, repeatEnds, repeatFrequency, repeatUntil]);

  const assigneeLabel = useMemo(() => {
    if (!task || task.assigneeIds.length === 0) return t`Unassigned`;
    const selected = filteredAssignees
      .filter((assignee) => task.assigneeIds.includes(assignee.id))
      .map((assignee) => assignee.name);
    if (selected.length === 1 && task.assigneeIds.length === 1) return selected[0];
    return t`${task.assigneeIds.length} assignees`;
  }, [filteredAssignees, task]);
  const completedSubtasksCount = useMemo(
    () => subtasks.reduce((total, subtask) => total + (subtask.isDone ? 1 : 0), 0),
    [subtasks],
  );

  const requestClose = () => {
    if (!isDirty && !repeatConfigDirty) {
      setSelectedTaskId(null);
      return;
    }
    setConfirmOpen(true);
  };

  const syncRepeatsOnSave = async () => {
    if (!canEdit) return true;
    if (!task) return true;
    const nextSignature = buildRepeatConfigSignature({
      frequency: repeatFrequency,
      ends: repeatEnds,
      until: repeatUntil,
      count: repeatCount,
    });
    if (nextSignature === repeatConfigSnapshotRef.current) return true;

    if (repeatFrequency !== 'none') {
      if (repeatEnds === 'after' && (!repeatCount || repeatCount < 1)) {
        setRepeatError(t`Enter how many repeats to create.`);
        return false;
      }
      if (repeatEnds === 'on' && !repeatUntil) {
        setRepeatError(t`Select an end date.`);
        return false;
      }
    }

    setRepeatError('');
    if (repeatFrequency === 'none') {
      repeatConfigSnapshotRef.current = nextSignature;
      return true;
    }

    if (repeatInFlightRef.current) return false;
    repeatInFlightRef.current = true;
    setRepeatCreating(true);
    setRepeatNotice('');

    const result = await createRepeats(task.id, {
      frequency: repeatFrequency,
      ends: repeatEnds,
      untilDate: repeatEnds === 'on' ? repeatUntil : undefined,
      count: repeatEnds === 'after' ? repeatCount : undefined,
    });

    repeatInFlightRef.current = false;
    setRepeatCreating(false);

    if (result.error) {
      if (result.error === 'No repeats created for the selected range.') {
        setRepeatError('');
        setRepeatNotice(t`No new repeats were needed.`);
        repeatConfigSnapshotRef.current = nextSignature;
        return true;
      }
      setRepeatError(result.error);
      return false;
    }

    setRepeatNotice(t`Created ${result.created ?? 0} tasks.`);
    repeatConfigSnapshotRef.current = nextSignature;
    return true;
  };

  const handleSaveAndClose = async () => {
    if (repeatScopeOpen || pendingRepeatUpdate) return;
    const repeatsSynced = await syncRepeatsOnSave();
    if (!repeatsSynced) return;
    setConfirmOpen(false);
    setSelectedTaskId(null);
  };

  const handleDiscardAndClose = () => {
    const originalTask = originalTaskRef.current;
    if (originalTask) {
      const { id, ...updates } = originalTask;
      updateTask(id, updates);
    }
    setConfirmOpen(false);
    setSelectedTaskId(null);
  };
  if (!task) {
    return <TaskNotFoundDialog open={Boolean(selectedTaskId)} onOpenChange={(open) => !open && requestClose()} />;
  }
  const isRepeating = Boolean(task.repeatId);
  const hasFutureRepeats = isRepeating
    ? tasks.some((item) => item.repeatId === task.repeatId && item.startDate > task.startDate)
    : false;

  const requestTaskUpdate = (updates: Partial<Task>, resetDraftOnCancel = false) => {
    if (!canEdit) return;
    if (!hasTaskUpdates(task, updates)) return;
    if (task.repeatId) {
      setPendingRepeatUpdate({
        taskId: task.id,
        updates,
        resetDraftOnCancel,
      });
      setRepeatScopeOpen(true);
      return;
    }
    void updateTask(task.id, updates, 'single');
  };

  const applyPendingRepeatUpdate = async (scope: RepeatTaskUpdateScope) => {
    const pending = pendingRepeatUpdate;
    if (!pending) return;
    setPendingRepeatUpdate(null);
    setRepeatScopeOpen(false);
    await updateTask(pending.taskId, pending.updates, scope);
  };

  const cancelPendingRepeatUpdate = () => {
    const pending = pendingRepeatUpdate;
    setPendingRepeatUpdate(null);
    setRepeatScopeOpen(false);
    if (!pending?.resetDraftOnCancel) return;
    titleDraftRef.current = task.title;
    setDraftTitle(task.title);
    const nextDescription = task.description || '';
    descriptionDraftRef.current = nextDescription;
    setDraftDescription(nextDescription);
  };

  const handleUpdate = (field: keyof Task, value: Task[keyof Task]) => requestTaskUpdate({ [field]: value } as Partial<Task>);

  const handleAssigneeToggle = (assigneeId: string) => {
    if (!canEdit) return;
    const targetAssignee = assignees.find((assignee) => assignee.id === assigneeId);
    if (targetAssignee && !targetAssignee.isActive && !task.assigneeIds.includes(assigneeId)) {
      return;
    }
    const next = task.assigneeIds.includes(assigneeId)
      ? task.assigneeIds.filter((id) => id !== assigneeId)
      : [...task.assigneeIds, assigneeId];
    const order = new Map(assignees.map((assignee, index) => [assignee.id, index]));
    const sorted = [...new Set(next)].sort((left, right) => (
      (order.get(left) ?? 0) - (order.get(right) ?? 0)
    ));
    requestTaskUpdate({ assigneeIds: sorted });
  };
  
  const handleTagToggle = (tagId: string) => {
    if (!canEdit) return;
    const newTagIds = task.tagIds.includes(tagId)
      ? task.tagIds.filter(id => id !== tagId)
      : [...task.tagIds, tagId];
    requestTaskUpdate({ tagIds: newTagIds });
  };
  
  const handleDelete = () => {
    if (canEdit) setDeleteOpen(true);
  };

  const handleDeleteTask = async () => {
    if (!canEdit) return;
    await deleteTask(task.id);
    setDeleteOpen(false);
  };

  const handleDeleteTaskAndFollowing = async () => {
    if (!canEdit || !task.repeatId) return;
    await deleteTaskSeries(task.repeatId, task.startDate);
    setDeleteOpen(false);
  };

  const handleOpenSubtasks = () => {
    setSubtasksOpen(true);
    setSubtasksError('');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        subtaskInputRef.current?.focus();
      });
    }
  };

  const handleAddSubtask = async () => {
    if (!task || !currentWorkspaceId || !canEdit) return;
    const title = newSubtaskTitle.trim();
    if (!title) return;

    const nextPosition = subtasks.length > 0
      ? Math.max(...subtasks.map((item) => item.position)) + 1
      : 0;

    setSubtasksSaving(true);
    setSubtasksError('');

    const { data, error } = await supabase
      .from('task_subtasks')
      .insert({
        workspace_id: currentWorkspaceId,
        task_id: task.id,
        title,
        is_done: false,
        done_at: null,
        position: nextPosition,
      })
      .select('id, task_id, title, is_done, done_at, position, created_at')
      .single();

    if (error || !data) {
      setSubtasksError(error?.message ?? t`Failed to add subtask.`);
      setSubtasksSaving(false);
      return;
    }

    setSubtasks((current) => [...current, mapSubtaskRow(data as TaskSubtaskRow)]);
    setNewSubtaskTitle('');
    setSubtasksSaving(false);
    subtaskInputRef.current?.focus();
  };

  const handleToggleSubtask = async (subtaskId: string, isDone: boolean) => {
    if (!task || !canEdit) return;
    const previous = subtasks.find((item) => item.id === subtaskId);
    if (!previous) return;

    const nextDoneAt = isDone ? new Date().toISOString() : null;
    setSubtasksError('');
    setSubtasks((current) => current.map((item) => (
      item.id === subtaskId
        ? { ...item, isDone, doneAt: nextDoneAt }
        : item
    )));

    const { error } = await supabase
      .from('task_subtasks')
      .update({
        is_done: isDone,
        done_at: nextDoneAt,
      })
      .eq('id', subtaskId)
      .eq('task_id', task.id);

    if (error) {
      setSubtasks((current) => current.map((item) => (
        item.id === subtaskId
          ? { ...item, isDone: previous.isDone, doneAt: previous.doneAt }
          : item
      )));
      setSubtasksError(error.message);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!task || !canEdit) return;
    const previous = subtasks.find((item) => item.id === subtaskId);
    if (!previous) return;

    setSubtasksError('');
    setSubtasks((current) => current.filter((item) => item.id !== subtaskId));

    const { error } = await supabase
      .from('task_subtasks')
      .delete()
      .eq('id', subtaskId)
      .eq('task_id', task.id);

    if (error) {
      setSubtasks((current) => (
        [...current, previous].sort((left, right) => left.position - right.position)
      ));
      setSubtasksError(error.message || t`Failed to delete subtask.`);
    }
  };

  return (
    <>
      <Dialog open={!!selectedTaskId} onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          className="w-[95vw] max-w-5xl max-h-[85vh] overflow-y-auto pt-10"
          onInteractOutside={(e) => {
            if (shouldIgnoreOutsideInteraction(e.target)) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            if (shouldIgnoreOutsideInteraction(e.target)) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t`Task details`}</DialogTitle>
            <DialogDescription>{t`View and edit task details.`}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="title">{t`Title`}</Label>
                <div className="space-y-1.5">
                  <Input
                    id="title"
                    value={draftTitle}
                    onChange={(e) => {
                      const nextTitle = e.target.value;
                      titleDraftRef.current = nextTitle;
                      setDraftTitle(nextTitle);
                    }}
                    onBlur={() => {
                      requestTaskUpdate({ title: titleDraftRef.current }, true);
                    }}
                    className="text-lg font-semibold"
                    disabled={isReadOnly}
                  />
                  {task.repeatId && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <RotateCw className="h-3 w-3" aria-hidden="true" />
                      <span>{t`Repeat`}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t`Project`}</Label>
                <Select
                  value={task.projectId || 'none'}
                  onValueChange={(v) => {
                    if (noProjectDisabled && v === 'none') return;
                    handleUpdate('projectId', v === 'none' ? null : v);
                    setProjectQuery('');
                  }}
                  onOpenChange={handleProjectSelectOpenChange}
                  disabled={isReadOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t`Select project`} />
                  </SelectTrigger>
                  <SelectContent onKeyDown={handleProjectSelectKeyDown}>
                    <div
                      className="max-h-48 overflow-y-auto overscroll-contain pr-2"
                      onWheelCapture={(event) => event.stopPropagation()}
                    >
                      <div className="px-2 py-1 text-[11px] text-muted-foreground">
                        <span
                          className="mr-1.5 inline-block h-3 w-px animate-pulse align-middle bg-foreground/60"
                          aria-hidden="true"
                        />
                        {projectQuery ? t`Filter: ${projectQuery}` : t`Type to filter projects...`}
                      </div>
                      <SelectItem value="none" disabled={noProjectDisabled}>{t`No project`}</SelectItem>
                      {filteredProjectOptions.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            {formatProjectLabel(project.name, project.code)}
                            {project.archived && (
                              <span className="ml-1 text-[10px] text-muted-foreground">({t`Archived`})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                      {filteredProjectOptions.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          {t`No projects found`}
                        </div>
                      )}
                    </div>
                  </SelectContent>
                </Select>
                {currentProject && (
                  <div className="text-xs text-muted-foreground">
                    {t`Customer`}: {currentProjectCustomer?.name ?? t`No customer`}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t`Description`}</Label>
                <RichTextEditor
                  id="description"
                  value={draftDescription}
                  workspaceId={currentWorkspaceId}
                  onChange={(value) => {
                    const nextDescription = value || '';
                    descriptionDraftRef.current = nextDescription;
                    setDraftDescription(nextDescription);
                  }}
                  onBlur={() => {
                    requestTaskUpdate({ description: descriptionDraftRef.current || null }, true);
                  }}
                  placeholder={t`Add a description...`}
                  disabled={isReadOnly}
                  className="max-h-[45vh] overflow-y-auto pr-2"
                />
              </div>

              {!subtasksOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-fit gap-1.5 text-xs"
                  onClick={handleOpenSubtasks}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t`Add subtask`}
                </Button>
              ) : (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">
                    {t`Completed`}: <span className="font-medium text-foreground">{completedSubtasksCount}</span>/{subtasks.length}
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      ref={subtaskInputRef}
                      value={newSubtaskTitle}
                      onChange={(event) => setNewSubtaskTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        void handleAddSubtask();
                      }}
                      placeholder={t`Subtask title`}
                      disabled={isReadOnly || subtasksSaving}
                      className="h-8 text-sm"
                    />
                    <Button
                      type="button"
                      className="h-8 px-3 text-xs"
                      onClick={() => void handleAddSubtask()}
                      disabled={isReadOnly || subtasksSaving || !newSubtaskTitle.trim()}
                    >
                      {t`Add`}
                    </Button>
                  </div>

                  {subtasksError && (
                    <div className="text-xs text-destructive">{subtasksError}</div>
                  )}

                  {subtasksLoading ? (
                    <div className="text-xs text-muted-foreground">{t`Loading...`}</div>
                  ) : subtasks.length === 0 ? (
                    <div className="text-xs text-muted-foreground">{t`No subtasks yet.`}</div>
                  ) : (
                    <div className="space-y-1.5">
                      {subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-start gap-2 rounded-md border px-2.5 py-2"
                        >
                          <Checkbox
                            checked={subtask.isDone}
                            onCheckedChange={(value) => {
                              if (value === 'indeterminate') return;
                              void handleToggleSubtask(subtask.id, value === true);
                            }}
                            disabled={isReadOnly}
                          />
                          <span
                            className={cn(
                              'flex-1 text-sm leading-snug text-foreground',
                              subtask.isDone && 'line-through text-muted-foreground',
                            )}
                          >
                            {subtask.title}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => void handleDeleteSubtask(subtask.id)}
                            disabled={isReadOnly}
                            aria-label={t`Remove subtask`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3 lg:border-l lg:pl-6">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/40">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t`Assignees`}</TooltipContent>
                  </Tooltip>
                  <div className="flex-1 min-w-0">
                    <Label className="sr-only">{t`Assignees`}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-8 w-full justify-between pl-3 pr-2 text-left text-sm" disabled={isReadOnly}>
                          <span className="flex-1 truncate text-left">{assigneeLabel}</span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        {selectableAssignees.length === 0 ? (
                          <div className="text-xs text-muted-foreground">{t`No assignees available.`}</div>
                        ) : (
                          <div
                            className="max-h-48 overflow-y-auto overscroll-contain pr-2"
                            onWheelCapture={(event) => event.stopPropagation()}
                          >
                            <div className="space-y-1">
                              {selectableAssignees.map((assignee) => {
                                const isAssigned = task.assigneeIds.includes(assignee.id);
                                const isDisabled = isReadOnly || (!assignee.isActive && !isAssigned);
                                return (
                                <label key={assignee.id} className="flex items-center gap-2 py-1 cursor-pointer">
                                  <Checkbox
                                    checked={isAssigned}
                                    onCheckedChange={() => handleAssigneeToggle(assignee.id)}
                                    disabled={isDisabled}
                                  />
                                  <span className="text-sm truncate">
                                    {assignee.name}
                                    {!assignee.isActive && (
                                      <span className="ml-1 text-[10px] text-muted-foreground">(disabled)</span>
                                    )}
                                  </span>
                                </label>
                              );
                              })}
                            </div>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/40">
                        <CircleDot className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t`Status`}</TooltipContent>
                  </Tooltip>
                  <div className="flex-1 min-w-0">
                    <Label className="sr-only">{t`Status`}</Label>
                    <Select
                      value={task.statusId}
                      onValueChange={(v) => handleUpdate('statusId', v)}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-8 w-full min-w-0 overflow-hidden pl-3 pr-2 text-left text-sm whitespace-nowrap">
                        <SelectValue placeholder={t`Select status`} className="truncate text-left" />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="truncate">{formatStatusLabel(s.name, s.emoji)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/40">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t`Type`}</TooltipContent>
                  </Tooltip>
                  <div className="flex-1 min-w-0">
                    <Label className="sr-only">{t`Type`}</Label>
                    <Select
                      value={task.typeId}
                      onValueChange={(v) => handleUpdate('typeId', v)}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-8 w-full pl-3 pr-2 text-left text-sm">
                        <SelectValue placeholder={t`Select type`} className="truncate text-left" />
                      </SelectTrigger>
                      <SelectContent>
                        {taskTypes.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/40">
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t`Priority`}</TooltipContent>
                  </Tooltip>
                  <div className="flex-1 min-w-0">
                    <Label className="sr-only">{t`Priority`}</Label>
                    <Select
                      value={task.priority ?? 'none'}
                      onValueChange={(value) => handleUpdate('priority', value === 'none' ? null : (value as TaskPriority))}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-8 w-full pl-3 pr-2 text-left text-sm">
                        <SelectValue placeholder={t`Select priority`} className="truncate text-left" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t`No priority`}</SelectItem>
                        <SelectItem value="low">{t`Low`}</SelectItem>
                        <SelectItem value="medium">{t`Medium`}</SelectItem>
                        <SelectItem value="high">{t`High`}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="startDate" className="text-xs text-muted-foreground">{t`Start Date`}</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={task.startDate}
                    onChange={(e) => handleUpdate('startDate', e.target.value)}
                    disabled={isReadOnly}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endDate" className="text-xs text-muted-foreground">{t`End Date`}</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={task.endDate}
                    onChange={(e) => handleUpdate('endDate', e.target.value)}
                    disabled={isReadOnly}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t`Repeat`}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Select
                      value={repeatFrequency}
                      onValueChange={(value) => handleRepeatFrequencyChange(value as typeof repeatFrequency)}
                      disabled={isReadOnly}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder={t`Repeat`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t`Does not repeat`}</SelectItem>
                        <SelectItem value="daily">{t`Daily`}</SelectItem>
                        <SelectItem value="weekly">{t`Weekly`}</SelectItem>
                        <SelectItem value="biweekly">{t`Biweekly (every 2 weeks)`}</SelectItem>
                        <SelectItem value="monthly">{t`Monthly`}</SelectItem>
                        <SelectItem value="yearly">{t`Yearly`}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{t`Repeat type`}</p>
                  </div>
                  <div className="space-y-1">
                    <Select
                      value={repeatEnds}
                      onValueChange={(value) => handleRepeatEndsChange(value as typeof repeatEnds)}
                      disabled={isReadOnly || repeatFrequency === 'none'}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder={t`Ends`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">{t`Never`}</SelectItem>
                        <SelectItem value="on">{t`Until date`}</SelectItem>
                        <SelectItem value="after">{t`Count`}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{t`Repeat limit`}</p>
                  </div>
                </div>
                {repeatFrequency !== 'none' && repeatEnds === 'on' && (
                  <div className="space-y-1">
                    <Label htmlFor="repeat-until" className="text-xs text-muted-foreground">{t`End date`}</Label>
                    <Input
                      id="repeat-until"
                      type="date"
                      value={repeatUntil}
                      onChange={(e) => {
                        repeatUntilAutoRef.current = false;
                        setRepeatUntil(e.target.value);
                      }}
                      disabled={isReadOnly}
                      className="h-8 text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">{t`Repeats until the selected date.`}</p>
                  </div>
                )}
                {repeatFrequency !== 'none' && repeatEnds === 'after' && (
                  <div className="space-y-1">
                    <Label htmlFor="repeat-count" className="text-xs text-muted-foreground">{t`Occurrences`}</Label>
                    <Input
                      id="repeat-count"
                      type="number"
                      min={1}
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(Number(e.target.value))}
                      disabled={isReadOnly}
                      className="h-8 text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">{t`Creates the specified number of repeats.`}</p>
                  </div>
                )}
                {repeatFrequency !== 'none' && repeatEnds === 'never' && (
                  <p className="text-[11px] text-muted-foreground">
                    {t`Creates repeats for the next 12 months.`}
                  </p>
                )}
                {repeatError && (
                  <div className="text-xs text-destructive">{repeatError}</div>
                )}
                {repeatNotice && (
                  <div className="text-xs text-emerald-600">{repeatNotice}</div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t`Tags`}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(tag => {
                    const isSelected = task.tagIds.includes(tag.id);
                    return (
                      <Badge
                        key={tag.id}
                        variant={isSelected ? 'default' : 'outline'}
                        className={cn(
                          'transition-all text-xs px-2 py-0.5',
                          isReadOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
                        )}
                        style={isSelected ? {
                          backgroundColor: tag.color,
                          borderColor: tag.color,
                        } : {
                          borderColor: tag.color,
                          color: tag.color,
                        }}
                        onClick={canEdit ? () => handleTagToggle(tag.id) : undefined}
                      >
                        {tag.name}
                        {isSelected && <X className="w-3 h-3 ml-1" />}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-destructive hover:text-destructive"
                  onClick={handleDelete}
                  disabled={isReadOnly}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t`Delete`}
                </Button>
              </div>

              <div className="pt-3 border-t border-border">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => duplicateTask(task.id)}
                    disabled={isReadOnly}
                  >
                    {t`Duplicate task`}
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8"
                    onClick={() => {
                      void handleSaveAndClose();
                    }}
                    disabled={repeatCreating}
                  >
                    OK
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <TaskDetailAlerts
        confirmOpen={confirmOpen}
        setConfirmOpen={setConfirmOpen}
        onDiscardAndClose={handleDiscardAndClose}
        onSaveAndClose={handleSaveAndClose}
        repeatCreating={repeatCreating}
        repeatScopeOpen={repeatScopeOpen}
        setRepeatScopeOpen={setRepeatScopeOpen}
        onCancelPendingRepeatUpdate={cancelPendingRepeatUpdate}
        onApplyPendingRepeatUpdate={applyPendingRepeatUpdate}
        deleteOpen={deleteOpen}
        setDeleteOpen={setDeleteOpen}
        isRepeating={isRepeating}
        hasFutureRepeats={hasFutureRepeats}
        taskTitle={task.title}
        canEdit={canEdit}
        onDeleteTask={handleDeleteTask}
        onDeleteTaskAndFollowing={handleDeleteTaskAndFollowing}
      />
    </>
  );
};
