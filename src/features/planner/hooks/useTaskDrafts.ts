import { Dispatch, MutableRefObject, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { Task } from '@/features/planner/types/planner';

export const areArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const areTasksEqual = (left: Task, right: Task) => (
  left.title === right.title &&
  left.projectId === right.projectId &&
  areArraysEqual(left.assigneeIds, right.assigneeIds) &&
  left.statusId === right.statusId &&
  left.typeId === right.typeId &&
  left.priority === right.priority &&
  left.startDate === right.startDate &&
  left.endDate === right.endDate &&
  // Skip description comparison while it is being lazy-loaded.
  (left.description === undefined || right.description === undefined || left.description === right.description) &&
  areArraysEqual(left.tagIds, right.tagIds)
);

interface UseTaskDraftsParams {
  task: Task | null | undefined;
  selectedTaskId: string | null;
}

export interface UseTaskDraftsResult {
  originalTaskRef: MutableRefObject<Task | null>;
  titleDraftRef: MutableRefObject<string>;
  descriptionDraftRef: MutableRefObject<string>;
  draftTitle: string;
  setDraftTitle: Dispatch<SetStateAction<string>>;
  draftDescription: string;
  setDraftDescription: Dispatch<SetStateAction<string>>;
  isDirty: boolean;
}

export const useTaskDrafts = ({
  task,
  selectedTaskId,
}: UseTaskDraftsParams): UseTaskDraftsResult => {
  const originalTaskRef = useRef<Task | null>(null);
  const titleDraftRef = useRef('');
  const descriptionDraftRef = useRef('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  // Track which selection the drafts were seeded for, plus the last value we
  // pushed into each draft. These let us tell an in-progress user edit apart
  // from an external update (live-sync / reconcile replacing the task object).
  const initializedIdRef = useRef<string | null>(null);
  const lastSyncedTitleRef = useRef('');
  const lastSyncedDescriptionRef = useRef('');

  useEffect(() => {
    if (!selectedTaskId) {
      originalTaskRef.current = null;
      return;
    }
    if (originalTaskRef.current?.id === selectedTaskId) {
      // Backfill description in originalRef when it was initially undefined (lazy-loaded).
      if (originalTaskRef.current.description === undefined && task?.description !== undefined) {
        originalTaskRef.current = { ...originalTaskRef.current, description: task.description };
      }
      return;
    }
    if (task) {
      originalTaskRef.current = {
        ...task,
        assigneeIds: [...task.assigneeIds],
        tagIds: [...task.tagIds],
      };
    }
  }, [selectedTaskId, task]);

  useEffect(() => {
    if (!task || !selectedTaskId) {
      titleDraftRef.current = '';
      descriptionDraftRef.current = '';
      setDraftTitle('');
      setDraftDescription('');
      initializedIdRef.current = null;
      lastSyncedTitleRef.current = '';
      lastSyncedDescriptionRef.current = '';
      return;
    }

    const isNewSelection = initializedIdRef.current !== selectedTaskId;

    // Title: always seed on a fresh selection. On a same-task object swap
    // (live-sync / reconcile) only adopt the incoming title when the user hasn't
    // typed over it — i.e. the draft still equals what we last pushed. This
    // reflects genuine external edits without ever clobbering an in-progress one.
    if (isNewSelection || titleDraftRef.current === lastSyncedTitleRef.current) {
      titleDraftRef.current = task.title;
      setDraftTitle(task.title);
    }
    lastSyncedTitleRef.current = task.title;

    // Description is lazy-loaded: `undefined` means "not fetched yet".
    if (isNewSelection) {
      // Seed immediately so the previous task's text never bleeds in. When the
      // description hasn't loaded yet, seed '' and let the backfill below adopt
      // the real value once it arrives.
      const initialDescription = task.description || '';
      descriptionDraftRef.current = initialDescription;
      setDraftDescription(initialDescription);
      lastSyncedDescriptionRef.current = task.description === undefined ? '' : initialDescription;
    } else if (
      task.description !== undefined
      && descriptionDraftRef.current === lastSyncedDescriptionRef.current
    ) {
      // Same task: adopt the lazy-loaded / externally-changed description unless
      // the user has an in-progress edit.
      const nextDescription = task.description || '';
      descriptionDraftRef.current = nextDescription;
      setDraftDescription(nextDescription);
      lastSyncedDescriptionRef.current = nextDescription;
    }

    initializedIdRef.current = selectedTaskId;
  }, [task, selectedTaskId]);

  const isDirty = useMemo(() => {
    if (!task || !originalTaskRef.current) return false;
    return !areTasksEqual(originalTaskRef.current, task);
  }, [task]);

  return {
    originalTaskRef,
    titleDraftRef,
    descriptionDraftRef,
    draftTitle,
    setDraftTitle,
    draftDescription,
    setDraftDescription,
    isDirty,
  };
};
