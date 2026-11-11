import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { lazyNamed } from '@/shared/lib/lazyComponent';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { TaskDetailAlerts, TaskNotFoundDialog } from '@/features/planner/components/TaskDetailDialogs';
import { TaskDetailFrame } from '@/features/planner/components/TaskDetailFrame';
import { TaskDetailHeader } from '@/features/planner/components/TaskDetailHeader';
import { TaskDetailDescription } from '@/features/planner/components/TaskDetailDescription';
import { TaskDetailParameters } from '@/features/planner/components/TaskDetailParameters';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { Task } from '@/features/planner/types/planner';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useTaskRepeatConfig } from '@/features/planner/hooks/useTaskRepeatConfig';
import { useTaskSubtasks } from '@/features/planner/hooks/useTaskSubtasks';
import { useTaskDrafts } from '@/features/planner/hooks/useTaskDrafts';
import { useTaskAttribution } from '@/features/planner/hooks/useTaskAttribution';
import { TaskHistoryButton } from '@/features/planner/components/TaskHistoryButton';
import { useTaskDescriptionSave } from '@/features/planner/hooks/useTaskDescriptionSave';
import { useTaskRepeatSave } from '@/features/planner/hooks/useTaskRepeatSave';
import { useTaskDetailClose } from '@/features/planner/hooks/useTaskDetailClose';
import { SubtasksSection } from '@/features/planner/components/SubtasksSection';
import { useTaskDraftPresence } from '@/features/planner/hooks/useTaskDraftPresence';
import { useSerialFieldWrite } from '@/features/planner/hooks/useSerialFieldWrite';
import { isTaskLiveDraftsEnabled } from '@/shared/lib/featureFlags';
import { hasTaskUpdates } from '@/shared/domain/taskUpdates';
import { formatTaskTimestamps } from '@/features/planner/lib/taskTimestamps';
import { clampTaskDates } from '@/features/planner/lib/dateUtils';

const LazyTaskCommentSection = lazyNamed(
  () => import('@/features/planner/components/TaskCommentSection'),
  'TaskCommentSection'
);

const NO_IDS: string[] = [];

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
    deleteTaskDeferred,
    deleteTaskSeries,
    duplicateTask,
    fetchTaskSubtasks,
    createTaskSubtask,
    updateTaskSubtaskTitle,
    updateTaskSubtaskCompletion,
    deleteTaskSubtask,
    updateTaskSubtaskImages,
    updateTaskSubtaskPositions,
    releaseTaskMedia,
    fetchTaskDescription,
  } = usePlannerStore(useShallow((state) => ({
    selectedTaskId: state.selectedTaskId,
    setSelectedTaskId: state.setSelectedTaskId,
    tasks: state.tasks,
    projects: state.projects,
    trackedProjectIds: state.trackedProjectIds,
    customers: state.customers,
    assignees: state.assignees,
    statuses: state.statuses,
    taskTypes: state.taskTypes,
    tags: state.tags,
    groupMode: state.groupMode,
    updateTask: state.updateTask,
    deleteTaskDeferred: state.deleteTaskDeferred,
    deleteTaskSeries: state.deleteTaskSeries,
    duplicateTask: state.duplicateTask,
    fetchTaskSubtasks: state.fetchTaskSubtasks,
    createTaskSubtask: state.createTaskSubtask,
    updateTaskSubtaskTitle: state.updateTaskSubtaskTitle,
    updateTaskSubtaskCompletion: state.updateTaskSubtaskCompletion,
    deleteTaskSubtask: state.deleteTaskSubtask,
    updateTaskSubtaskImages: state.updateTaskSubtaskImages,
    updateTaskSubtaskPositions: state.updateTaskSubtaskPositions,
    releaseTaskMedia: state.releaseTaskMedia,
    fetchTaskDescription: state.fetchTaskDescription,
  })));
  const currentWorkspaceRole = useAuthStore((state) => state.currentWorkspaceRole);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const isMobile = useIsMobile();
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
  const [subtaskEditingActive, setSubtaskEditingActive] = useState(false);

  const task = tasks.find(t => t.id === selectedTaskId);
  const taskId = task?.id ?? null;

  // Assignees and tags are picked with several taps in a row; each tap is
  // counted from the last picked value and written one at a time
  // (useSerialFieldWrite). A tap for a task that is no longer open still goes
  // out, straight through the store.
  const requestTaskUpdateRef = useRef<((updates: Partial<Task>) => Promise<void> | void) | null>(null);
  const writePickedField = (pickedTaskId: string, updates: Partial<Task>) => {
    const state = usePlannerStore.getState();
    if (state.selectedTaskId === pickedTaskId && requestTaskUpdateRef.current) {
      return requestTaskUpdateRef.current(updates);
    }
    const live = state.tasks.find((item) => item.id === pickedTaskId);
    if (!live || live.repeatId || !hasTaskUpdates(live, updates)) return undefined;
    return state.updateTask(pickedTaskId, updates, 'single');
  };
  const [pickedAssigneeIds, setPickedAssigneeIds] = useSerialFieldWrite(
    task?.assigneeIds ?? NO_IDS,
    (assigneeIds, pickedTaskId) => writePickedField(pickedTaskId, { assigneeIds }),
    taskId,
  );
  const [pickedTagIds, setPickedTagIds] = useSerialFieldWrite(
    task?.tagIds ?? NO_IDS,
    (tagIds, pickedTaskId) => writePickedField(pickedTaskId, { tagIds }),
    taskId,
  );

  const descriptionLoading = task !== undefined && task.description === undefined;

  useEffect(() => {
    if (descriptionLoading && taskId) {
      fetchTaskDescription(taskId);
    }
  }, [descriptionLoading, taskId, fetchTaskDescription]);

  const drafts = useTaskDrafts({ task, selectedTaskId });
  const {
    recordOwnEdits,
    titleDraftRef,
    descriptionDraftRef,
    draftTitle, setDraftTitle,
    draftDescription, setDraftDescription,
    isDirty,
  } = drafts;
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
  const noProjectDisabled = groupMode === 'project';

  const repeat = useTaskRepeatConfig({ task: task ?? null, tasks, selectedTaskId });
  const {
    repeatCreating,
    repeatScopeOpen, setRepeatScopeOpen,
    pendingRepeatUpdate, setPendingRepeatUpdate,
    repeatConfigDirty,
  } = repeat;

  const {
    subtasksOpen,
    subtasksLoading,
    subtasksError,
    subtasks,
    newSubtaskTitle, setNewSubtaskTitle,
    completedSubtasksCount,
    subtaskInputRef,
    handleOpenSubtasks,
    handleAddSubtask,
    handleEditSubtask,
    handleToggleSubtask,
    handleDeleteSubtask,
    handleReorderSubtask,
    subtaskImages,
  } = useTaskSubtasks({
    taskId,
    currentWorkspaceId,
    canEdit,
    fetchTaskSubtasks,
    createTaskSubtask,
    updateTaskSubtaskTitle,
    updateTaskSubtaskCompletion,
    deleteTaskSubtask,
    updateTaskSubtaskImages,
    updateTaskSubtaskPositions,
    releaseTaskMedia,
  });

  // Teammates' drafts, live: desktop only for now (owner's call).
  const { teammateDrafts, shareDraft } = useTaskDraftPresence({
    taskId,
    enabled: isTaskLiveDraftsEnabled() && !isMobile,
  });
  const descriptionDrafts = teammateDrafts.filter((entry) => entry.draft.kind === 'description');

  // Attribution is fetched only for the open card, outside the timeline's data.
  const taskCreatedAt = task?.createdAt;
  const taskUpdatedAt = task?.updatedAt;
  const { createdByName, updatedByName } = useTaskAttribution(taskId, taskUpdatedAt);
  const timestampsMeta = formatTaskTimestamps(
    taskCreatedAt, taskUpdatedAt, createdByName, updatedByName,
  );

  const descriptionSave = useTaskDescriptionSave({ task, selectedTaskId, canEdit, drafts });
  const {
    descriptionConflict,
    descriptionConflictRef,
    descriptionSavesConditionally,
    saveDescriptionDraft,
    takeTeammateDescription,
  } = descriptionSave;

  const { syncRepeatsOnSave, applyPendingRepeatUpdate, cancelPendingRepeatUpdate } = useTaskRepeatSave({
    task,
    canEdit,
    repeat,
    drafts,
    closeCard: () => {
      setConfirmOpen(false);
      setSelectedTaskId(null);
    },
  });

  const {
    setCommentDraftDirty,
    commentConfirmOpen,
    setCommentConfirmOpen,
    requestClose,
    handleDiscardCommentAndContinue,
    handleSaveAndClose,
    handleDiscardAndClose,
    handleCancelClose,
  } = useTaskDetailClose({
    task,
    taskId,
    canEdit,
    setConfirmOpen,
    isDirty,
    repeatConfigDirty,
    subtaskEditingDirty,
    repeatScopeOpen,
    pendingRepeatUpdate,
    descriptionSave,
    syncRepeatsOnSave,
    drafts,
  });

  if (!task) {
    return <TaskNotFoundDialog open={Boolean(selectedTaskId)} onOpenChange={(open) => !open && requestClose()} />;
  }
  const isRepeating = Boolean(task.repeatId);
  const hasFutureRepeats = isRepeating
    ? tasks.some((item) => item.repeatId === task.repeatId && item.startDate > task.startDate)
    : false;

  const requestTaskUpdate = (updates: Partial<Task>, resetDraftOnCancel = false) => {
    if (!canEdit) return;
    // Compare with the store, not this render: a write that just landed may
    // not have re-rendered the card yet.
    const base = usePlannerStore.getState().tasks.find((item) => item.id === task.id) ?? task;
    if (!hasTaskUpdates(base, updates)) return;
    if (base.repeatId) {
      setPendingRepeatUpdate({
        kind: 'task-update',
        taskId: task.id,
        updates,
        resetDraftOnCancel,
      });
      setRepeatScopeOpen(true);
      return;
    }
    recordOwnEdits(base, updates);
    return updateTask(task.id, updates, 'single');
  };
  requestTaskUpdateRef.current = requestTaskUpdate;

  const handleUpdate = (field: keyof Task, value: Task[keyof Task]) => requestTaskUpdate({ [field]: value } as Partial<Task>);

  // Dates must keep end >= start. Moving the start past the end drags the end
  // with it; the end itself can never be set before the start.
  const handleStartDateChange = (value: string) => {
    const { startDate, endDate } = clampTaskDates(value, task.endDate);
    requestTaskUpdate(endDate !== task.endDate ? { startDate, endDate } : { startDate });
  };

  const handleEndDateChange = (value: string) => {
    requestTaskUpdate({ endDate: clampTaskDates(task.startDate, value).endDate });
  };

  const handleDelete = () => {
    if (canEdit) setDeleteOpen(true);
  };

  const handleDeleteTask = async () => {
    if (!canEdit) return;
    await deleteTaskDeferred(task.id);
    setDeleteOpen(false);
  };

  const handleDeleteTaskAndFollowing = async () => {
    if (!canEdit || !task.repeatId) return;
    await deleteTaskSeries(task.repeatId, task.startDate);
    setDeleteOpen(false);
  };

  const alerts = (
    <TaskDetailAlerts
      confirmOpen={confirmOpen}
      setConfirmOpen={setConfirmOpen}
      onDiscardAndClose={handleDiscardAndClose}
      onSaveAndClose={() => handleSaveAndClose(true)}
      commentConfirmOpen={commentConfirmOpen}
      setCommentConfirmOpen={setCommentConfirmOpen}
      onDiscardComment={handleDiscardCommentAndContinue}
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
  );

  return (
    <TaskDetailFrame
      isMobile={isMobile}
      open={!!selectedTaskId}
      onRequestClose={requestClose}
      timestampsMeta={timestampsMeta}
      renderUpdatedLine={taskUpdatedAt ? (line) => (
        <TaskHistoryButton
          taskId={task.id}
          updatedAt={taskUpdatedAt}
          label={line}
          isMobile={isMobile}
          statuses={statuses}
          projects={projects}
          assignees={assignees}
        />
      ) : undefined}
      onCancel={handleCancelClose}
      onDone={() => {
        void handleSaveAndClose();
      }}
      doneDisabled={repeatCreating}
      escapeBelongsToField={subtaskEditingActive || newSubtaskTitle !== '' || subtaskImages.draftImages.length > 0}
      alerts={alerts}
    >
      {/* Full-height tint behind the parameters column, header and footer included. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[340px] border-l border-border bg-secondary/70 lg:block"
      />

      <TaskDetailHeader
        currentProject={currentProject}
        currentProjectCustomer={currentProjectCustomer}
        isRepeating={isRepeating}
        draftTitle={draftTitle}
        onTitleChange={(nextTitle) => {
          titleDraftRef.current = nextTitle;
          setDraftTitle(nextTitle);
        }}
        onTitleBlur={() => {
          requestTaskUpdate({ title: titleDraftRef.current }, true);
        }}
        isReadOnly={isReadOnly}
        onDuplicate={() => duplicateTask(task.id)}
        onDelete={handleDelete}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── Left column: description, subtasks, comments */}
        <div className="min-w-0 space-y-5 px-6 pb-6 pt-1">
          <TaskDetailDescription
            descriptionDrafts={descriptionDrafts}
            shareDraft={shareDraft}
            descriptionConflict={descriptionConflict}
            descriptionConflictRef={descriptionConflictRef}
            onTakeTeammateVersion={takeTeammateDescription}
            onKeepMine={() => void saveDescriptionDraft({ force: true })}
            descriptionLoading={descriptionLoading}
            draftDescription={draftDescription}
            workspaceId={currentWorkspaceId}
            isReadOnly={isReadOnly}
            onChange={(nextDescription) => {
              descriptionDraftRef.current = nextDescription;
              setDraftDescription(nextDescription);
            }}
            onBlur={() => {
              if (descriptionSavesConditionally) void saveDescriptionDraft();
              else requestTaskUpdate({ description: descriptionDraftRef.current || null }, true);
            }}
          />

          <SubtasksSection
            isReadOnly={isReadOnly}
            subtasksOpen={subtasksOpen}
            subtasksLoading={subtasksLoading}
            subtasksError={subtasksError}
            subtasks={subtasks}
            newSubtaskTitle={newSubtaskTitle}
            completedSubtasksCount={completedSubtasksCount}
            subtaskInputRef={subtaskInputRef}
            onOpen={handleOpenSubtasks}
            onNewTitleChange={setNewSubtaskTitle}
            onAdd={() => void handleAddSubtask()}
            onCommitDraft={() => void handleAddSubtask({ refocus: false })}
            onEdit={handleEditSubtask}
            onToggle={(id, isDone) => void handleToggleSubtask(id, isDone)}
            onDelete={(id) => void handleDeleteSubtask(id)}
            onReorder={(id, toIndex) => void handleReorderSubtask(id, toIndex)}
            onEditingDirtyChange={setSubtaskEditingDirty}
            onEditingActiveChange={setSubtaskEditingActive}
            teammateDrafts={teammateDrafts}
            onShareDraft={shareDraft}
            images={subtaskImages}
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
                  teammateDrafts={teammateDrafts}
                  onShareDraft={shareDraft}
                  onDraftDirtyChange={setCommentDraftDirty}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* ── Right column: parameters panel */}
        <TaskDetailParameters
          task={task}
          projectOptions={projectOptions}
          noProjectDisabled={noProjectDisabled}
          canEdit={canEdit}
          isMobile={isMobile}
          assignees={assignees}
          filteredAssignees={filteredAssignees}
          pickedAssigneeIds={pickedAssigneeIds}
          setPickedAssigneeIds={setPickedAssigneeIds}
          statuses={statuses}
          taskTypes={taskTypes}
          tags={tags}
          pickedTagIds={pickedTagIds}
          setPickedTagIds={setPickedTagIds}
          onUpdate={handleUpdate}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          repeat={repeat}
        />
      </div>
    </TaskDetailFrame>
  );
};
