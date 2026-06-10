import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { RepeatSettingsFields } from '@/features/planner/components/RepeatSettingsFields';
import { TaskProjectSelect } from '@/features/planner/components/TaskProjectSelect';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { TaskDetailAlerts, TaskNotFoundDialog } from '@/features/planner/components/TaskDetailDialogs';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
const LazyRichTextEditor = lazy(() =>
  import('@/features/planner/components/RichTextEditor').then((m) => ({ default: m.RichTextEditor }))
);
const LazyTaskCommentSection = lazy(() =>
  import('@/features/planner/components/TaskCommentSection').then((m) => ({ default: m.TaskCommentSection }))
);
import { Label } from '@/shared/ui/label';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { cn } from '@/shared/lib/classNames';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Badge } from '@/shared/ui/badge';
import { AlertTriangle, ChevronDown, CircleDot, Layers, Plus, RotateCw, Trash2, User, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { RepeatTaskUpdateScope, Task, TaskPriority } from '@/features/planner/types/planner';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useTaskRepeatConfig, PendingRepeatUpdate, buildRepeatConfigSignature } from '@/features/planner/hooks/useTaskRepeatConfig';
import { useTaskSubtasks } from '@/features/planner/hooks/useTaskSubtasks';
import { useTaskDrafts, areArraysEqual } from '@/features/planner/hooks/useTaskDrafts';
import { SubtasksSection } from '@/features/planner/components/SubtasksSection';
import { format } from 'date-fns';
import { t } from '@lingui/macro';
import {
  buildCreateRepeatsOptions,
  resolveRepeatValidationMessage,
  RepeatEnds,
  RepeatFrequency,
} from '@/features/planner/lib/taskFormRules';

const shouldIgnoreOutsideInteraction = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('[data-radix-popper-content-wrapper]')
    || target.closest('[data-mention-popover="true"]')
    || target.closest('[data-mention-branch="true"]'),
  );
};


const hasTaskUpdates = (task: Task, updates: Partial<Task>) => (
  Object.entries(updates).some(([key, value]) => {
    const currentValue = task[key as keyof Task];
    if (Array.isArray(currentValue) && Array.isArray(value)) {
      return !areArraysEqual(currentValue, value);
    }
    return currentValue !== value;
  })
);


const resolveScopedRepeatCount = (params: {
  repeatCount: number;
  scope: Exclude<RepeatTaskUpdateScope, 'single'>;
  selectedTaskStartDate: string;
  series: Task[];
}) => {
  if (params.scope === 'all') return params.repeatCount;
  if (params.repeatCount !== params.series.length) return params.repeatCount;
  return params.series.filter((item) => item.startDate >= params.selectedTaskStartDate).length;
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
    updateRepeatSeries,
    fetchTaskSubtasks,
    createTaskSubtask,
    updateTaskSubtaskTitle,
    updateTaskSubtaskCompletion,
    deleteTaskSubtask,
    fetchTaskDescription,
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [subtaskEditingDirty, setSubtaskEditingDirty] = useState(false);

  const task = tasks.find(t => t.id === selectedTaskId);
  const taskId = task?.id ?? null;
  const descriptionLoading = task !== undefined && task.description === undefined;

  useEffect(() => {
    if (descriptionLoading && taskId) {
      fetchTaskDescription(taskId);
    }
  }, [descriptionLoading, taskId, fetchTaskDescription]);

  const {
    originalTaskRef,
    titleDraftRef,
    descriptionDraftRef,
    draftTitle, setDraftTitle,
    draftDescription, setDraftDescription,
    isDirty,
  } = useTaskDrafts({ task, selectedTaskId });
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

  const {
    repeatFrequency, setRepeatFrequency,
    repeatEnds, setRepeatEnds,
    repeatUntil, setRepeatUntil,
    repeatCount, setRepeatCount,
    repeatError, setRepeatError,
    repeatNotice, setRepeatNotice,
    repeatCreating, setRepeatCreating,
    repeatScopeOpen, setRepeatScopeOpen,
    pendingRepeatUpdate, setPendingRepeatUpdate,
    repeatInFlightRef,
    repeatUntilAutoRef,
    repeatConfigSnapshotRef,
    repeatConfigDirty,
    handleRepeatFrequencyChange,
    handleRepeatEndsChange,
    handleRepeatUntilChange,
    handleRepeatCountInputChange,
  } = useTaskRepeatConfig({ task: task ?? null, tasks, selectedTaskId });

  const {
    subtasksOpen, setSubtasksOpen,
    subtasksLoading,
    subtasksSaving,
    subtasksError, setSubtasksError,
    subtasks,
    newSubtaskTitle, setNewSubtaskTitle,
    completedSubtasksCount,
    subtaskInputRef,
    handleOpenSubtasks,
    handleAddSubtask,
    handleEditSubtask,
    handleToggleSubtask,
    handleDeleteSubtask,
  } = useTaskSubtasks({
    taskId,
    currentWorkspaceId,
    canEdit,
    fetchTaskSubtasks,
    createTaskSubtask,
    updateTaskSubtaskTitle,
    updateTaskSubtaskCompletion,
    deleteTaskSubtask,
  });

  const assigneeLabel = useMemo(() => {
    if (!task || task.assigneeIds.length === 0) return t`Unassigned`;
    const selected = filteredAssignees
      .filter((assignee) => task.assigneeIds.includes(assignee.id))
      .map((assignee) => assignee.name);
    if (selected.length === 1 && task.assigneeIds.length === 1) return selected[0];
    return t`${task.assigneeIds.length} assignees`;
  }, [filteredAssignees, task]);
  const requestClose = () => {
    // A subtask edit in progress, or an unsent new-subtask draft, also counts
    // as unsaved work — warn before closing so the changes aren't lost.
    const subtaskDirty = subtaskEditingDirty || newSubtaskTitle.trim().length > 0;
    if (!isDirty && !repeatConfigDirty && !subtaskDirty) {
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

    const repeatValidationMessage = resolveRepeatValidationMessage({
      frequency: repeatFrequency,
      ends: repeatEnds,
      until: repeatUntil,
      count: repeatCount,
    }, {
      missingCount: t`Enter how many repeats to create.`,
      missingUntil: t`Select an end date.`,
    });
    if (repeatValidationMessage) {
      setRepeatError(repeatValidationMessage);
      return false;
    }

    setRepeatError('');
    if (repeatFrequency === 'none') {
      repeatConfigSnapshotRef.current = nextSignature;
      return true;
    }

    if (task.repeatId) {
      setPendingRepeatUpdate({
        kind: 'repeat-config',
        taskId: task.id,
        options: buildCreateRepeatsOptions({
          frequency: repeatFrequency,
          ends: repeatEnds,
          until: repeatUntil,
          count: repeatCount,
        }),
        nextSignature,
        closeAfterApply: true,
        scopes: ['all', 'following'],
      });
      setRepeatScopeOpen(true);
      return false;
    }

    if (repeatInFlightRef.current) return false;
    repeatInFlightRef.current = true;
    setRepeatCreating(true);
    setRepeatNotice('');

    const result = await createRepeats(
      task.id,
      buildCreateRepeatsOptions({
        frequency: repeatFrequency,
        ends: repeatEnds,
        until: repeatUntil,
        count: repeatCount,
      }),
    );

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
    // Flush unsaved description draft before closing.
    // onBlur of the rich-text editor is the normal save path, but it can be
    // skipped (React event batching) when the user clicks OK without first
    // moving focus away from the editor.
    // Guard: only flush when description has already been lazy-loaded
    // (undefined means "not yet fetched" — flushing null would corrupt the DB).
    if (canEdit && task && task.description !== undefined) {
      const pendingDescription = descriptionDraftRef.current || null;
      if (hasTaskUpdates(task, { description: pendingDescription })) {
        void updateTask(task.id, { description: pendingDescription }, 'single');
      }
    }
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
        kind: 'task-update',
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
    if (pending.kind === 'task-update') {
      // "Only this task" detaches the occurrence from its series (repeatId: null)
      // so future edits treat it as a standalone task and never ask for scope again.
      const updates = scope === 'single'
        ? { ...(pending.updates ?? {}), repeatId: null }
        : (pending.updates ?? {});
      await updateTask(pending.taskId, updates, scope);
      return;
    }
    if (scope === 'single' || !task || !pending.options) return;
    if (repeatInFlightRef.current) return;

    repeatInFlightRef.current = true;
    setRepeatCreating(true);
    setRepeatError('');
    setRepeatNotice('');

    const series = tasks.filter((item) => item.repeatId === task.repeatId);
    const result = await updateRepeatSeries(
      pending.taskId,
      pending.options.ends === 'after'
        ? {
          ...pending.options,
          count: resolveScopedRepeatCount({
            repeatCount: pending.options.count ?? repeatCount,
            scope,
            selectedTaskStartDate: task.startDate,
            series,
          }),
        }
        : pending.options,
      scope,
    );

    repeatInFlightRef.current = false;
    setRepeatCreating(false);

    if (result.error) {
      setRepeatError(result.error);
      return;
    }

    if (pending.nextSignature) {
      repeatConfigSnapshotRef.current = pending.nextSignature;
    }
    if (pending.closeAfterApply) {
      setConfirmOpen(false);
      setSelectedTaskId(null);
    }
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
                <TaskProjectSelect
                  value={task.projectId || 'none'}
                  projects={projectOptions}
                  disabled={isReadOnly}
                  noProjectDisabled={noProjectDisabled}
                  showArchivedBadge
                  onValueChange={(v) => {
                    if (noProjectDisabled && v === 'none') return;
                    handleUpdate('projectId', v === 'none' ? null : v);
                  }}
                />
                {currentProject && (
                  <div className="text-xs text-muted-foreground">
                    {t`Customer`}: {currentProjectCustomer?.name ?? t`No customer`}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t`Description`}</Label>
                {descriptionLoading ? (
                  <div className="min-h-[140px] rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground animate-pulse" />
                ) : (
                  <Suspense fallback={
                    <div className="min-h-[140px] rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      {t`Loading editor...`}
                    </div>
                  }>
                    <LazyRichTextEditor
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
                  </Suspense>
                )}
              </div>

              <SubtasksSection
                isReadOnly={isReadOnly}
                subtasksOpen={subtasksOpen}
                subtasksLoading={subtasksLoading}
                subtasksSaving={subtasksSaving}
                subtasksError={subtasksError}
                subtasks={subtasks}
                newSubtaskTitle={newSubtaskTitle}
                completedSubtasksCount={completedSubtasksCount}
                subtaskInputRef={subtaskInputRef}
                onOpen={handleOpenSubtasks}
                onNewTitleChange={setNewSubtaskTitle}
                onAdd={() => void handleAddSubtask()}
                onEdit={handleEditSubtask}
                onToggle={(id, isDone) => void handleToggleSubtask(id, isDone)}
                onDelete={(id) => void handleDeleteSubtask(id)}
                onEditingDirtyChange={setSubtaskEditingDirty}
              />

              {/* ── Comments section */}
              {currentWorkspaceId && (
                <div className="border-t border-border pt-3">
                  <Suspense fallback={
                    <div className="h-16 rounded-md bg-muted/30 animate-pulse" />
                  }>
                    <LazyTaskCommentSection
                      taskId={task.id}
                      workspaceId={currentWorkspaceId}
                      canEdit={canEdit}
                    />
                  </Suspense>
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
                <RepeatSettingsFields
                  compact
                  count={repeatCount}
                  disabled={isReadOnly}
                  ends={repeatEnds}
                  error={repeatError}
                  frequency={repeatFrequency}
                  idPrefix="detail"
                  notice={repeatNotice}
                  onCountInputChange={handleRepeatCountInputChange}
                  onEndsChange={handleRepeatEndsChange}
                  onFrequencyChange={handleRepeatFrequencyChange}
                  onUntilChange={handleRepeatUntilChange}
                  showNeverHint
                  until={repeatUntil}
                />
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
        repeatScopeOptions={pendingRepeatUpdate?.scopes}
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
