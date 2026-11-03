import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import { useDraftSubtasks } from '@/features/planner/hooks/useDraftSubtasks';
import { useNewTaskRepeat } from '@/features/planner/hooks/useNewTaskRepeat';
import { useAddTaskTimeOff } from '@/features/planner/hooks/useAddTaskTimeOff';
import { sortProjectsByTracking } from '@/shared/lib/projectSorting';
import { orderAssigneesForPopover } from '@/features/planner/lib/assigneePopoverOrder';
import { clampTaskDates, format } from '@/features/planner/lib/dateUtils';
import { resolveDefaultStatusId } from '@/features/planner/lib/defaultStatus';
import {
  buildCreateRepeatsOptions,
  resolveAddTaskProjectValue,
  resolveRepeatValidationMessage,
} from '@/features/planner/lib/taskFormRules';
import type { TaskPriority } from '@/features/planner/types/planner';

export interface UseAddTaskFormOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStartDate?: string;
  initialEndDate?: string;
  initialProjectId?: string | null;
  initialAssigneeIds?: string[];
  initialStatusId?: string;
  timeOffEnabled?: boolean;
  timeOffOnly?: boolean;
  onCreated?: () => void;
}

/**
 * Everything the add-task dialog keeps: the task fields, its repeat and draft
 * subtasks, the time-off mode, the "discard?" question, creating the task and
 * putting the form back to its starting values each time the dialog opens.
 */
export const useAddTaskForm = ({
  open,
  onOpenChange,
  initialStartDate,
  initialEndDate,
  initialProjectId,
  initialAssigneeIds,
  initialStatusId,
  timeOffEnabled = false,
  timeOffOnly = false,
  onCreated,
}: UseAddTaskFormOptions) => {
  const {
    projects,
    trackedProjectIds,
    assignees,
    statuses,
    taskTypes,
    tags,
    groupMode,
    addTask,
    createRepeats,
    createTaskSubtasks,
    releaseTaskMedia,
  } = usePlannerStore(useShallow((state) => ({
    projects: state.projects,
    trackedProjectIds: state.trackedProjectIds,
    assignees: state.assignees,
    statuses: state.statuses,
    taskTypes: state.taskTypes,
    tags: state.tags,
    groupMode: state.groupMode,
    addTask: state.addTask,
    createRepeats: state.createRepeats,
    createTaskSubtasks: state.createTaskSubtasks,
    releaseTaskMedia: state.releaseTaskMedia,
  })));
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const filteredAssignees = useFilteredAssignees(assignees);
  const activeProjects = useMemo(
    () => sortProjectsByTracking(
      projects.filter((project) => !project.archived),
      trackedProjectIds,
    ),
    [projects, trackedProjectIds],
  );
  const selectableAssignees = useMemo(
    () => filteredAssignees.filter((assignee) => assignee.isActive),
    [filteredAssignees],
  );
  const defaultStatusId = useMemo(() => {
    return resolveDefaultStatusId(statuses);
  }, [statuses]);
  const noProjectDisabled = groupMode === 'project';
  const fallbackProjectId = activeProjects[0]?.id;

  const today = new Date();
  const defaultStart = format(today, 'yyyy-MM-dd');
  const initialStart = initialStartDate ?? defaultStart;
  const initialEnd = initialEndDate ?? initialStart;
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('none');
  const [projectInitialized, setProjectInitialized] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [statusId, setStatusId] = useState(defaultStatusId);
  const [typeId, setTypeId] = useState(taskTypes[0]?.id || '');
  const [priority, setPriority] = useState<TaskPriority | 'none'>('none');
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [repeatCreating, setRepeatCreating] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  // Second mode of this dialog: "Отметить выходной". Task fields stay mounted
  // but hidden, so switching back and forth keeps what was already typed.
  const [mode, setMode] = useState<'task' | 'time_off'>(timeOffOnly ? 'time_off' : 'task');
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const [assigneePopoverFrozenOrderIds, setAssigneePopoverFrozenOrderIds] = useState<string[] | null>(null);
  const [waitingForImages, setWaitingForImages] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const titleInputRef = useRef<HTMLInputElement>(null);

  const markChanged = useCallback(() => {
    setHasChanges(true);
  }, []);

  const repeat = useNewTaskRepeat({ initialStart, startDate, markChanged });
  const draftSubtasks = useDraftSubtasks({
    workspaceId: currentWorkspaceId,
    releaseTaskMedia,
    markChanged,
  });
  const {
    subtasks,
    setSubtasks,
    focusSubtaskIdRef,
    draftSubtaskImages,
    setSubtaskImagesError,
    clearDraftSubtasks,
  } = draftSubtasks;
  const timeOffMode = useAddTaskTimeOff({
    open,
    timeOffEnabled,
    onSaved: () => {
      setHasChanges(false);
      onOpenChange(false);
      onCreated?.();
    },
  });
  const {
    setTimeOffAssigneeId,
    setTimeOffStart,
    setTimeOffEnd,
    setTimeOffNote,
    setTimeOffError,
    setTimeOffSaving,
    myAssigneeId,
    canPickTimeOffAssignee,
  } = timeOffMode;

  const sortAssigneeIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return [];
    const order = new Map(assignees.map((assignee, index) => [assignee.id, index]));
    return Array.from(new Set(ids)).sort((left, right) => (
      (order.get(left) ?? 0) - (order.get(right) ?? 0)
    ));
  }, [assignees]);

  const normalizeAssigneeSelection = useCallback((ids: string[] | undefined) => {
    if (!ids || ids.length === 0) return [];
    return sortAssigneeIds(ids);
  }, [sortAssigneeIds]);

  const handleTagToggle = (tagId: string) => {
    markChanged();
    setTagIds((prev) => (
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    ));
  };

  const setAssigneeChecked = useCallback((assigneeId: string, checked: boolean) => {
    markChanged();
    setAssigneeIds((prev) => {
      const next = checked
        ? [...prev, assigneeId]
        : prev.filter((id) => id !== assigneeId);
      return sortAssigneeIds(next);
    });
  }, [markChanged, sortAssigneeIds]);

  const requestClose = () => {
    // The task exists but its subtasks aren't written yet: closing now would
    // leave it half made. While only waiting for pictures, nothing exists
    // yet and closing simply cancels (a stuck upload can't lock the form).
    if (repeatCreating && !waitingForImages) return;
    if (hasChanges) {
      setConfirmCloseOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      requestClose();
      return;
    }
    onOpenChange(true);
  };

  const discardAndClose = () => {
    setConfirmCloseOpen(false);
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleStartDateChange = (value: string) => {
    markChanged();
    setStartDate(value);
    // Keep the end on/after the start: bump it forward when the start passes it.
    setEndDate((prev) => clampTaskDates(value, prev).endDate);
    repeat.followStartDate(value);
  };

  const handleAssigneePopoverOpenChange = useCallback((nextOpen: boolean) => {
    setAssigneePopoverOpen(nextOpen);
    if (nextOpen) {
      // Freeze a "selected first" order on open: already-chosen people sit at the
      // top (easier to see), and the list stays stable while open instead of
      // jumping as more are checked. Newly checked ones rise to the top next open.
      const ordered = orderAssigneesForPopover({
        assignees: selectableAssignees,
        selectedAssigneeIds: assigneeIds,
        frozenOrderIds: null,
      });
      setAssigneePopoverFrozenOrderIds(ordered.map((assignee) => assignee.id));
      return;
    }
    setAssigneePopoverFrozenOrderIds(null);
  }, [selectableAssignees, assigneeIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !statusId || !typeId) return;

    const { repeatFrequency, repeatEnds, repeatUntil, repeatCount, setRepeatError } = repeat;
    setRepeatError('');
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
      return;
    }

    // A subtask needs a title; pictures on an untitled draft would be dropped
    // without a word. Ask for the title instead.
    setSubtaskImagesError('');
    const untitledWithPictures = subtasks.find((subtask) => (
      !subtask.title.trim()
      && (draftSubtaskImages.imagesFor(subtask.id).length > 0 || draftSubtaskImages.uploadingFor(subtask.id) > 0)
    ));
    if (untitledWithPictures) {
      setSubtaskImagesError(t`Give the subtask with pictures a title, or remove it.`);
      focusSubtaskIdRef.current = untitledWithPictures.id;
      setSubtasks((current) => [...current]);
      return;
    }

    setRepeatCreating(true);
    // Pictures still uploading land first: the task is created only once
    // its subtasks can be written whole.
    setWaitingForImages(true);
    await draftSubtaskImages.waitForUploads();
    setWaitingForImages(false);
    // Closed while waiting: the person cancelled before anything was created.
    if (!openRef.current) {
      setRepeatCreating(false);
      return;
    }
    const safeDates = clampTaskDates(startDate, endDate);
    const createdTask = await addTask({
      title: title.trim(),
      projectId: projectId === 'none' ? null : projectId,
      assigneeIds,
      statusId,
      typeId,
      priority: priority === 'none' ? null : priority,
      startDate: safeDates.startDate,
      endDate: safeDates.endDate,
      tagIds,
      description: description.trim() || null,
      repeatId: null,
    });

    if (!createdTask) {
      setRepeatError(t`Failed to create task.`);
      setRepeatCreating(false);
      return;
    }

    const imagesByDraft = draftSubtaskImages.snapshot();
    const savedDrafts = subtasks
      .map((subtask) => ({ title: subtask.title.trim(), images: imagesByDraft[subtask.id] ?? [] }))
      .filter((draft) => draft.title);
    // A draft with pictures but no title never becomes a subtask.
    const savedDraftIds = new Set(subtasks.filter((subtask) => subtask.title.trim()).map((subtask) => subtask.id));
    const orphanedImages = Object.entries(imagesByDraft)
      .filter(([draftId]) => !savedDraftIds.has(draftId))
      .flatMap(([, images]) => images.map((image) => image.id));
    if (orphanedImages.length > 0) releaseTaskMedia(orphanedImages);
    if (savedDrafts.length > 0 && currentWorkspaceId) {
      const titles = savedDrafts.map((draft) => draft.title);
      const hasImages = savedDrafts.some((draft) => draft.images.length > 0);
      const subtaskResult = hasImages
        ? await createTaskSubtasks(currentWorkspaceId, createdTask.id, titles, savedDrafts.map((draft) => draft.images))
        : await createTaskSubtasks(currentWorkspaceId, createdTask.id, titles);
      if (subtaskResult.error) {
        console.error(subtaskResult.error);
        toast(t`Task was created, but subtasks were not saved.`);
        const unsaved = savedDrafts.flatMap((draft) => draft.images.map((image) => image.id));
        if (unsaved.length > 0) releaseTaskMedia(unsaved);
      }
    }
    // Written (or released above): the form no longer owns these pictures.
    draftSubtaskImages.forget();

    if (repeatFrequency !== 'none') {
      const result = await createRepeats(
        createdTask.id,
        buildCreateRepeatsOptions({
          frequency: repeatFrequency,
          ends: repeatEnds,
          until: repeatUntil,
          count: repeatCount,
        }),
      );
      if (result.error) {
        setRepeatError(result.error);
        setRepeatCreating(false);
        return;
      }
    }

    // Reset form
    setTitle('');
    setProjectId(resolveAddTaskProjectValue({
      fallbackProjectId,
      noProjectDisabled,
    }));
    setProjectInitialized(false);
    setAssigneeIds([]);
    setStatusId(defaultStatusId);
    setTypeId(taskTypes[0]?.id || '');
    setPriority('none');
    setStartDate(defaultStart);
    setEndDate(defaultStart);
    setTagIds([]);
    setDescription('');
    repeat.resetRepeat(defaultStart);
    setRepeatCreating(false);
    setHasChanges(false);
    setAssigneePopoverOpen(false);
    setAssigneePopoverFrozenOrderIds(null);
    setSubtasks([]);

    onCreated?.();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!statusId && defaultStatusId) {
      setStatusId(defaultStatusId);
    }
  }, [defaultStatusId, statusId]);

  const { resetRepeat } = repeat;
  useEffect(() => {
    if (!open) {
      setProjectInitialized(false);
      setHasChanges(false);
      setConfirmCloseOpen(false);
      setAssigneePopoverOpen(false);
      setAssigneePopoverFrozenOrderIds(null);
      // Closed without creating: nothing will show these pictures.
      clearDraftSubtasks();
      setTimeOffError('');
      setTimeOffSaving(false);
      return;
    }
    if (projectInitialized) return;
    const nextStart = initialStartDate ?? defaultStart;
    const nextEnd = initialEndDate ?? nextStart;
    const nextProjectId = resolveAddTaskProjectValue({
      initialProjectId,
      fallbackProjectId,
      noProjectDisabled,
    });
    const nextAssignees = normalizeAssigneeSelection(initialAssigneeIds)
      .filter((id) => selectableAssignees.some((assignee) => assignee.id === id));

    setStartDate(nextStart);
    setEndDate(nextEnd);
    setProjectId(nextProjectId);
    setAssigneeIds(nextAssignees);
    setStatusId(
      initialStatusId && statuses.some((status) => status.id === initialStatusId)
        ? initialStatusId
        : defaultStatusId,
    );
    resetRepeat(nextStart);
    setHasChanges(false);
    setAssigneePopoverOpen(false);
    setAssigneePopoverFrozenOrderIds(null);
    setSubtasks([]);
    setMode(timeOffOnly ? 'time_off' : 'task');
    // Prefill the person: an admin who double-clicked someone's row marks that
    // person, everyone else marks themselves.
    setTimeOffAssigneeId(
      (canPickTimeOffAssignee ? nextAssignees[0] : null) ?? myAssigneeId ?? '',
    );
    setTimeOffStart(nextStart);
    setTimeOffEnd(nextEnd);
    setTimeOffNote('');
    setTimeOffError('');
    setTimeOffSaving(false);
    setProjectInitialized(true);
  }, [
    canPickTimeOffAssignee,
    clearDraftSubtasks,
    myAssigneeId,
    timeOffOnly,
    defaultStart,
    fallbackProjectId,
    initialAssigneeIds,
    initialEndDate,
    initialStatusId,
    initialProjectId,
    initialStartDate,
    normalizeAssigneeSelection,
    defaultStatusId,
    noProjectDisabled,
    open,
    projectInitialized,
    resetRepeat,
    selectableAssignees,
    setSubtasks,
    setTimeOffAssigneeId,
    setTimeOffEnd,
    setTimeOffError,
    setTimeOffNote,
    setTimeOffSaving,
    setTimeOffStart,
    statuses,
  ]);

  useEffect(() => {
    if (!typeId && taskTypes[0]?.id) {
      setTypeId(taskTypes[0].id);
    }
  }, [taskTypes, typeId]);

  const assigneeLabel = useMemo(() => {
    if (assigneeIds.length === 0) return t`Unassigned`;
    const selected = selectableAssignees
      .filter((assignee) => assigneeIds.includes(assignee.id))
      .map((assignee) => assignee.name);
    if (selected.length === 1 && assigneeIds.length === 1) return selected[0];
    return t`${assigneeIds.length} assignees`;
  }, [assigneeIds, selectableAssignees]);

  const orderedSelectableAssignees = useMemo(() => {
    return orderAssigneesForPopover({
      assignees: selectableAssignees,
      selectedAssigneeIds: assigneeIds,
      frozenOrderIds: assigneePopoverOpen ? assigneePopoverFrozenOrderIds : null,
    });
  }, [assigneeIds, assigneePopoverFrozenOrderIds, assigneePopoverOpen, selectableAssignees]);

  return {
    currentWorkspaceId,
    statuses,
    taskTypes,
    tags,
    activeProjects,
    selectableAssignees,
    orderedSelectableAssignees,
    assigneeLabel,
    noProjectDisabled,
    title,
    setTitle,
    projectId,
    setProjectId,
    assigneeIds,
    setAssigneeIds,
    statusId,
    setStatusId,
    typeId,
    setTypeId,
    priority,
    setPriority,
    startDate,
    endDate,
    setEndDate,
    tagIds,
    description,
    setDescription,
    repeatCreating,
    confirmCloseOpen,
    setConfirmCloseOpen,
    mode,
    setMode,
    assigneePopoverOpen,
    waitingForImages,
    titleInputRef,
    markChanged,
    repeat,
    draftSubtasks,
    timeOffMode,
    handleTagToggle,
    setAssigneeChecked,
    requestClose,
    handleDialogOpenChange,
    discardAndClose,
    handleStartDateChange,
    handleAssigneePopoverOpenChange,
    handleSubmit,
  };
};

export type AddTaskForm = ReturnType<typeof useAddTaskForm>;
