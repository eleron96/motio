import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { RepeatPopoverField } from '@/features/planner/components/RepeatPopoverField';
import { TaskProjectSelect } from '@/features/planner/components/TaskProjectSelect';
import { TagMultiSelect } from '@/features/planner/components/TagMultiSelect';
import { ComposerEyebrow } from '@/features/planner/components/ComposerEyebrow';
import { Dialog, DialogDescription, DialogHeader, DialogScrollContent, DialogTitle } from '@/shared/ui/dialog';
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
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { UserAvatar } from '@/shared/ui/UserAvatar';
import { getPersonMonogram } from '@/shared/domain/personName';
import { ChevronDown, Copy, MoreVertical, RotateCw, Trash2 } from 'lucide-react';
import { RepeatTaskUpdateScope, Task, TaskPriority } from '@/features/planner/types/planner';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useTaskRepeatConfig, PendingRepeatUpdate, buildRepeatConfigSignature } from '@/features/planner/hooks/useTaskRepeatConfig';
import { useTaskSubtasks } from '@/features/planner/hooks/useTaskSubtasks';
import { useTaskDrafts, areArraysEqual } from '@/features/planner/hooks/useTaskDrafts';
import { SubtasksSection } from '@/features/planner/components/SubtasksSection';
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

  // Footer «Cancel»: close discarding pending title/description drafts.
  // Already-saved field changes (status, dates, ...) stay — same semantics as
  // closing without saving, but without the confirm dialog.
  const handleCancelClose = () => {
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
        <DialogScrollContent
          className="flex w-full max-w-[940px] flex-col gap-0 p-0"
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

          {/* Full-height tint behind the parameters column, header and footer included. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 hidden w-[340px] border-l border-border bg-muted/40 lg:block"
          />

          {/* ── Header: project crumb, large title, actions.
              On wide screens the header block stops where the tinted
              parameters panel begins, so the title never crosses into it. */}
          <div className="relative px-6 pb-3 pr-20 pt-5 lg:mr-[340px] lg:pr-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {currentProject ? (
                <>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: currentProject.color }}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-foreground">
                    {formatProjectLabel(currentProject.name, currentProject.code)}
                  </span>
                  {currentProject.archived && (
                    <span className="text-[10px] text-muted-foreground">({t`Archived`})</span>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>
                    {currentProjectCustomer
                      ? `${t`Customer`}: ${currentProjectCustomer.name}`
                      : t`No customer`}
                  </span>
                </>
              ) : (
                <span>{t`No project`}</span>
              )}
              {isRepeating && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <RotateCw className="h-3 w-3" aria-hidden="true" />
                    {t`Repeat`}
                  </span>
                </>
              )}
            </div>
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
              placeholder={t`Task title`}
              aria-label={t`Title`}
              className="-mx-2 mt-1 h-auto rounded-md border-0 bg-transparent px-2 py-1 text-2xl font-bold tracking-tight shadow-none hover:bg-muted/60 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 md:text-2xl"
              disabled={isReadOnly}
            />
          </div>

          {!isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-10 top-2.5 h-8 w-8 text-muted-foreground"
                  aria-label={t`Task actions`}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => duplicateTask(task.id)}>
                  <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                  {t`Duplicate task`}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={handleDelete}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                  {t`Delete task`}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="relative grid lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* ── Left column: description, subtasks, comments */}
            <div className="space-y-5 px-6 pb-6 pt-1">
              <div className="space-y-2">
                <ComposerEyebrow>{t`Description`}</ComposerEyebrow>
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
                      framed
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
                <div className="border-t border-border pt-4">
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

            {/* ── Right column: parameters panel */}
            <div className="space-y-3.5 border-t border-border bg-muted/40 px-5 pb-6 pt-4 lg:border-0 lg:bg-transparent lg:pt-1">
              <ComposerEyebrow>{t`Parameters`}</ComposerEyebrow>

              <div className="space-y-1.5">
                <Label>{t`Project`}</Label>
                <TaskProjectSelect
                  value={task.projectId || 'none'}
                  projects={projectOptions}
                  disabled={isReadOnly}
                  noProjectDisabled={noProjectDisabled}
                  showArchivedBadge
                  triggerClassName="h-auto min-h-10 bg-background [&>span]:line-clamp-2"
                  onValueChange={(v) => {
                    if (noProjectDisabled && v === 'none') return;
                    handleUpdate('projectId', v === 'none' ? null : v);
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t`Assignees`}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between bg-background font-normal"
                      disabled={isReadOnly}
                    >
                      <span className="truncate">{assigneeLabel}</span>
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
                                <UserAvatar
                                  avatarUrl={assignee.avatar}
                                  initials={getPersonMonogram(assignee.name, 'U')}
                                  colorSeed={assignee.userId ?? assignee.id}
                                  size="xs"
                                />
                                <span className="text-sm truncate">
                                  {assignee.name}
                                  {!assignee.isActive && (
                                    <span className="ml-1 text-[10px] text-muted-foreground">({t`disabled`})</span>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 min-w-0">
                  <Label>{t`Status`}</Label>
                  <Select
                    value={task.statusId}
                    onValueChange={(v) => handleUpdate('statusId', v)}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger className="min-w-0 overflow-hidden whitespace-nowrap bg-background text-left">
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

                <div className="space-y-1.5 min-w-0">
                  <Label>{t`Priority`}</Label>
                  <Select
                    value={task.priority ?? 'none'}
                    onValueChange={(value) => handleUpdate('priority', value === 'none' ? null : (value as TaskPriority))}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger className="bg-background text-left">
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

              <div className="space-y-1.5">
                <Label>{t`Type`}</Label>
                <Select
                  value={task.typeId}
                  onValueChange={(v) => handleUpdate('typeId', v)}
                  disabled={isReadOnly}
                >
                  <SelectTrigger className="bg-background text-left">
                    <SelectValue placeholder={t`Select type`} className="truncate text-left" />
                  </SelectTrigger>
                  <SelectContent>
                    {taskTypes.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="startDate">{t`Start Date`}</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={task.startDate}
                    onChange={(e) => handleUpdate('startDate', e.target.value)}
                    disabled={isReadOnly}
                    className="bg-background px-2 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="endDate">{t`End Date`}</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={task.endDate}
                    onChange={(e) => handleUpdate('endDate', e.target.value)}
                    disabled={isReadOnly}
                    className="bg-background px-2 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t`Repeat`}</Label>
                <RepeatPopoverField
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

              <div className="space-y-1.5">
                <Label>{t`Tags`}</Label>
                <TagMultiSelect
                  tags={tags}
                  selectedTagIds={task.tagIds}
                  onToggleTag={handleTagToggle}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>

          {/* ── Footer */}
          <div className="relative flex items-center justify-end gap-2 px-6 py-3.5">
            <Button variant="outline" onClick={handleCancelClose}>
              {t`Cancel`}
            </Button>
            <Button
              onClick={() => {
                void handleSaveAndClose();
              }}
              disabled={repeatCreating}
            >
              {/* Distinct id: the bare "Done" msgid is a task status («Завершено»). */}
              {t({ id: 'taskDetail.footer.done', message: 'Done' })}
            </Button>
          </div>
        </DialogScrollContent>
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
