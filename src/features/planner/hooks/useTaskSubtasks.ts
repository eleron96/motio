import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { toast } from '@/shared/ui/sonner';
import { subscribeToOpenTaskRows } from '@/infrastructure/tasks/openTaskLiveChannel';
import { TaskSubtask } from '@/features/planner/types/planner';
import { MutationResult } from '@/features/planner/store/plannerStore.helpers';
import { TaskSubtaskImage } from '@/shared/domain/taskSubtaskImages';
import {
  SUBTASK_DRAFT_IMAGES_KEY,
  SubtaskImagesController,
  useSubtaskImages,
} from '@/features/planner/hooks/useSubtaskImages';

interface UseTaskSubtasksParams {
  taskId: string | null;
  currentWorkspaceId: string | null;
  canEdit: boolean;
  fetchTaskSubtasks: (workspaceId: string, taskId: string) => Promise<{ subtasks: TaskSubtask[]; error?: string }>;
  createTaskSubtask: (
    workspaceId: string,
    taskId: string,
    title: string,
    position: number,
    images?: TaskSubtaskImage[],
  ) => Promise<{ subtask?: TaskSubtask; error?: string }>;
  updateTaskSubtaskTitle: (workspaceId: string, taskId: string, subtaskId: string, title: string) => Promise<MutationResult>;
  updateTaskSubtaskCompletion: (workspaceId: string, taskId: string, subtaskId: string, isDone: boolean, doneAt: string | null) => Promise<MutationResult>;
  deleteTaskSubtask: (workspaceId: string, taskId: string, subtaskId: string) => Promise<MutationResult>;
  updateTaskSubtaskImages: (workspaceId: string, taskId: string, subtaskId: string, images: TaskSubtaskImage[]) => Promise<MutationResult>;
  releaseTaskMedia: (mediaIds: string[]) => void;
}

export interface UseTaskSubtasksResult {
  subtasksOpen: boolean;
  setSubtasksOpen: Dispatch<SetStateAction<boolean>>;
  subtasksLoading: boolean;
  subtasksSaving: boolean;
  subtasksError: string;
  setSubtasksError: Dispatch<SetStateAction<string>>;
  subtasks: TaskSubtask[];
  newSubtaskTitle: string;
  setNewSubtaskTitle: Dispatch<SetStateAction<string>>;
  completedSubtasksCount: number;
  subtaskInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  handleOpenSubtasks: () => void;
  handleAddSubtask: (options?: { refocus?: boolean }) => Promise<void>;
  handleEditSubtask: (subtaskId: string, title: string) => Promise<boolean>;
  handleToggleSubtask: (subtaskId: string, isDone: boolean) => Promise<void>;
  handleDeleteSubtask: (subtaskId: string) => Promise<void>;
  subtaskImages: SubtaskImagesController;
}

/** Several changes in a row (a teammate ticking a few boxes) — one re-read. */
const LIVE_REFETCH_DELAY_MS = 250;

const resolveNextSubtaskPosition = (subtasks: TaskSubtask[]) => (
  subtasks.length > 0 ? Math.max(...subtasks.map((item) => item.position)) + 1 : 0
);

export const useTaskSubtasks = ({
  taskId,
  currentWorkspaceId,
  canEdit,
  fetchTaskSubtasks,
  createTaskSubtask: createTaskSubtaskRaw,
  updateTaskSubtaskTitle: updateTaskSubtaskTitleRaw,
  updateTaskSubtaskCompletion: updateTaskSubtaskCompletionRaw,
  deleteTaskSubtask: deleteTaskSubtaskRaw,
  updateTaskSubtaskImages: updateTaskSubtaskImagesRaw,
  releaseTaskMedia,
}: UseTaskSubtasksParams): UseTaskSubtasksResult => {
  // Own writes in flight, and a counter bumped whenever one starts or ends.
  // A live re-read that overlaps either would bring back the list as it was
  // before our write — a ticked box unticks, then ticks again on the echo —
  // so such a re-read is thrown away and asked again (see the live effect).
  const ownWritesRef = useRef({ inFlight: 0, generation: 0 });
  const trackOwnWrite = useCallback(async <T,>(write: () => Promise<T>): Promise<T> => {
    const writes = ownWritesRef.current;
    writes.inFlight += 1;
    writes.generation += 1;
    try {
      return await write();
    } finally {
      writes.inFlight -= 1;
      writes.generation += 1;
    }
  }, []);
  const createTaskSubtask = useCallback<UseTaskSubtasksParams['createTaskSubtask']>(
    (...args) => trackOwnWrite(() => createTaskSubtaskRaw(...args)),
    [createTaskSubtaskRaw, trackOwnWrite],
  );
  const updateTaskSubtaskTitle = useCallback<UseTaskSubtasksParams['updateTaskSubtaskTitle']>(
    (...args) => trackOwnWrite(() => updateTaskSubtaskTitleRaw(...args)),
    [trackOwnWrite, updateTaskSubtaskTitleRaw],
  );
  const updateTaskSubtaskCompletion = useCallback<UseTaskSubtasksParams['updateTaskSubtaskCompletion']>(
    (...args) => trackOwnWrite(() => updateTaskSubtaskCompletionRaw(...args)),
    [trackOwnWrite, updateTaskSubtaskCompletionRaw],
  );
  const deleteTaskSubtask = useCallback<UseTaskSubtasksParams['deleteTaskSubtask']>(
    (...args) => trackOwnWrite(() => deleteTaskSubtaskRaw(...args)),
    [deleteTaskSubtaskRaw, trackOwnWrite],
  );
  const updateTaskSubtaskImages = useCallback<UseTaskSubtasksParams['updateTaskSubtaskImages']>(
    (...args) => trackOwnWrite(() => updateTaskSubtaskImagesRaw(...args)),
    [trackOwnWrite, updateTaskSubtaskImagesRaw],
  );

  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [subtasksSaving, setSubtasksSaving] = useState(false);
  const [subtasksError, setSubtasksError] = useState('');
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLTextAreaElement | null>(null);
  // Which task a new subtask is being saved for right now, so a second save of
  // the same draft (Enter, then the blur it causes) doesn't create it twice.
  const addingForTaskIdRef = useRef<string | null>(null);
  const activeTaskIdRef = useRef(taskId);
  activeTaskIdRef.current = taskId;
  // Latest values for the save that runs when the task is left (see below).
  const draftTitleRef = useRef(newSubtaskTitle);
  draftTitleRef.current = newSubtaskTitle;
  const subtasksRef = useRef(subtasks);
  subtasksRef.current = subtasks;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const createTaskSubtaskRef = useRef(createTaskSubtask);
  createTaskSubtaskRef.current = createTaskSubtask;
  const releaseTaskMediaRef = useRef(releaseTaskMedia);
  releaseTaskMediaRef.current = releaseTaskMedia;

  const {
    controller: subtaskImages,
    draftImagesRef,
    clearDraftImages,
  } = useSubtaskImages({
    taskId,
    currentWorkspaceId,
    canEdit,
    subtasksRef,
    setSubtasks,
    updateTaskSubtaskImages,
    releaseTaskMedia,
  });

  // Leaving a task (closing the panel, opening another one) must not lose a
  // typed subtask: whatever is still in the composer is saved for the task it
  // was typed in. Declared before the loading effect so this cleanup still
  // sees the draft before that effect clears it.
  useEffect(() => {
    if (!taskId || !currentWorkspaceId) return;
    return () => {
      const title = draftTitleRef.current.trim();
      // The pictures in the composer right now, not when the task opened.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const images = draftImagesRef.current;
      if (addingForTaskIdRef.current === taskId) return;
      // Pictures pasted without a title never become a subtask: let them go.
      if (!title || !canEditRef.current) {
        if (images.length > 0) releaseTaskMediaRef.current(images.map((image) => image.id));
        return;
      }
      draftTitleRef.current = '';
      const position = resolveNextSubtaskPosition(subtasksRef.current);
      void createTaskSubtaskRef.current(currentWorkspaceId, taskId, title, position, images)
        .then((result) => {
          if (result.error || !result.subtask) {
            toast.error(t`Failed to add subtask.`);
            if (images.length > 0) releaseTaskMediaRef.current(images.map((image) => image.id));
          }
        });
    };
  }, [currentWorkspaceId, draftImagesRef, taskId]);

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
      const result = await fetchTaskSubtasks(currentWorkspaceId, taskId);

      if (!active) return;
      if (result.error) {
        setSubtasksError(result.error);
        setSubtasks([]);
        setSubtasksLoading(false);
        return;
      }

      setSubtasks(result.subtasks);
      setSubtasksOpen(result.subtasks.length > 0);
      setSubtasksLoading(false);
    };

    void loadSubtasks();
    return () => {
      active = false;
    };
  }, [currentWorkspaceId, fetchTaskSubtasks, taskId]);

  // A teammate's new, ticked, renamed or deleted subtask shows up while the
  // card is open, instead of only after reopening it. The list is re-read
  // rather than patched from the event, so it always matches the server.
  useEffect(() => {
    if (!taskId || !currentWorkspaceId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refetch = async () => {
      timer = null;
      const writes = ownWritesRef.current;
      const startedAt = writes.generation;
      const result = await fetchTaskSubtasks(currentWorkspaceId, taskId);
      if (!active || result.error) return;
      // One of our own writes overlapped this read: its answer may predate
      // the write. Ask again; the write's own echo will settle the list.
      if (writes.inFlight > 0 || writes.generation !== startedAt) {
        scheduleRefetch();
        return;
      }
      setSubtasks(result.subtasks);
      if (result.subtasks.length > 0) setSubtasksOpen(true);
    };

    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refetch(), LIVE_REFETCH_DELAY_MS);
    };
    // A change event, a reconnect or a return to the tab: one re-read.
    const unsubscribe = subscribeToOpenTaskRows('task_subtasks', taskId, scheduleRefetch, scheduleRefetch);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [currentWorkspaceId, fetchTaskSubtasks, taskId]);

  const completedSubtasksCount = useMemo(
    () => subtasks.reduce((total, subtask) => total + (subtask.isDone ? 1 : 0), 0),
    [subtasks],
  );

  const handleOpenSubtasks = useCallback(() => {
    setSubtasksOpen(true);
    setSubtasksError('');
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        subtaskInputRef.current?.focus();
      });
    }
  }, []);

  const handleAddSubtask = useCallback(async ({ refocus = true }: { refocus?: boolean } = {}) => {
    if (!taskId || !currentWorkspaceId || !canEdit) return;
    if (addingForTaskIdRef.current === taskId) return;
    const title = newSubtaskTitle.trim();
    if (!title) return;
    // A picture still uploading belongs to this subtask: wait for it.
    if ((subtaskImages.uploading[SUBTASK_DRAFT_IMAGES_KEY] ?? 0) > 0) return;
    const images = draftImagesRef.current;

    addingForTaskIdRef.current = taskId;
    setSubtasksSaving(true);
    setSubtasksError('');

    const result = await createTaskSubtask(
      currentWorkspaceId,
      taskId,
      title,
      resolveNextSubtaskPosition(subtasks),
      images,
    );
    if (addingForTaskIdRef.current === taskId) addingForTaskIdRef.current = null;

    // The panel moved on to another task (or closed) while this was saving:
    // its state now belongs to that task, so only report a failure.
    if (activeTaskIdRef.current !== taskId) {
      if (result.error || !result.subtask) toast.error(t`Failed to add subtask.`);
      return;
    }

    if (result.error || !result.subtask) {
      setSubtasksError(result.error ?? t`Failed to add subtask.`);
      setSubtasksSaving(false);
      return;
    }

    const createdSubtask = result.subtask;
    // A live re-read may already have brought it in.
    setSubtasks((current) => (
      current.some((item) => item.id === createdSubtask.id) ? current : [...current, createdSubtask]
    ));
    setNewSubtaskTitle('');
    clearDraftImages();
    setSubtasksSaving(false);
    if (refocus) subtaskInputRef.current?.focus();
  }, [
    canEdit,
    clearDraftImages,
    createTaskSubtask,
    currentWorkspaceId,
    draftImagesRef,
    newSubtaskTitle,
    subtaskImages.uploading,
    subtasks,
    taskId,
  ]);

  const handleEditSubtask = useCallback(async (subtaskId: string, title: string) => {
    if (!taskId || !currentWorkspaceId || !canEdit) return false;
    const previous = subtasks.find((item) => item.id === subtaskId);
    if (!previous) return false;

    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === previous.title) return true;

    setSubtasksError('');
    setSubtasks((current) => current.map((item) => (
      item.id === subtaskId ? { ...item, title: nextTitle } : item
    )));

    const result = await updateTaskSubtaskTitle(currentWorkspaceId, taskId, subtaskId, nextTitle);
    if (result.error) {
      setSubtasks((current) => current.map((item) => (
        item.id === subtaskId ? { ...item, title: previous.title } : item
      )));
      setSubtasksError(result.error || t`Failed to update subtask.`);
      return false;
    }

    return true;
  }, [canEdit, currentWorkspaceId, subtasks, taskId, updateTaskSubtaskTitle]);

  const handleToggleSubtask = useCallback(async (subtaskId: string, isDone: boolean) => {
    if (!taskId || !currentWorkspaceId || !canEdit) return;
    const previous = subtasks.find((item) => item.id === subtaskId);
    if (!previous) return;

    const nextDoneAt = isDone ? new Date().toISOString() : null;
    setSubtasksError('');
    setSubtasks((current) => current.map((item) => (
      item.id === subtaskId
        ? { ...item, isDone, doneAt: nextDoneAt }
        : item
    )));

    const result = await updateTaskSubtaskCompletion(
      currentWorkspaceId,
      taskId,
      subtaskId,
      isDone,
      nextDoneAt,
    );
    if (result.error) {
      setSubtasks((current) => current.map((item) => (
        item.id === subtaskId
          ? { ...item, isDone: previous.isDone, doneAt: previous.doneAt }
          : item
      )));
      setSubtasksError(result.error);
    }
  }, [canEdit, currentWorkspaceId, subtasks, taskId, updateTaskSubtaskCompletion]);

  const handleDeleteSubtask = useCallback(async (subtaskId: string) => {
    if (!taskId || !currentWorkspaceId || !canEdit) return;
    const previous = subtasks.find((item) => item.id === subtaskId);
    if (!previous) return;

    setSubtasksError('');
    setSubtasks((current) => current.filter((item) => item.id !== subtaskId));

    const result = await deleteTaskSubtask(currentWorkspaceId, taskId, subtaskId);
    if (result.error) {
      setSubtasks((current) => (
        [...current, previous].sort((left, right) => left.position - right.position)
      ));
      setSubtasksError(result.error || t`Failed to delete subtask.`);
      return;
    }
    if (previous.images.length > 0) releaseTaskMedia(previous.images.map((image) => image.id));
  }, [canEdit, currentWorkspaceId, deleteTaskSubtask, releaseTaskMedia, subtasks, taskId]);

  return {
    subtasksOpen,
    setSubtasksOpen,
    subtasksLoading,
    subtasksSaving,
    subtasksError,
    setSubtasksError,
    subtasks,
    newSubtaskTitle,
    setNewSubtaskTitle,
    completedSubtasksCount,
    subtaskInputRef,
    handleOpenSubtasks,
    handleAddSubtask,
    handleEditSubtask,
    handleToggleSubtask,
    handleDeleteSubtask,
    subtaskImages,
  };
};
