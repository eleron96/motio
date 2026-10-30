import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Task } from '@/features/planner/types/planner';
import {
  hasTaskOwnEditsToRevert,
  recordTaskOwnEdits,
  TaskOwnEditField,
  TaskOwnEdits,
} from '@/shared/domain/taskOwnEdits';

export const areArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const NO_EDITS: TaskOwnEdits = {};

interface UseTaskDraftsParams {
  task: Task | null | undefined;
  selectedTaskId: string | null;
}

export interface UseTaskDraftsResult {
  /** This person's edits since the card opened — what Discard rolls back. */
  ownEdits: TaskOwnEdits;
  /** Call with the task as it was right before an edit we just saved. */
  recordOwnEdits: (before: Task, updates: Partial<Task>) => void;
  titleDraftRef: MutableRefObject<string>;
  descriptionDraftRef: MutableRefObject<string>;
  /**
   * The stored description the current draft started from. A teammate's
   * change made while the person types isn't adopted, so this stays the base
   * the save is checked against.
   */
  descriptionBaseRef: MutableRefObject<string>;
  /** Replace the draft with a stored description (e.g. a teammate's newer one). */
  adoptDescription: (description: string) => void;
  /** Our save of `description` landed: it is the base from now on. */
  markDescriptionSaved: (description: string) => void;
  /** Forget own edits of these fields (the person took a teammate's version). */
  forgetOwnEdits: (fields: TaskOwnEditField[]) => void;
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
  const [ownEdits, setOwnEdits] = useState<{ taskId: string | null; edits: TaskOwnEdits }>({
    taskId: null,
    edits: {},
  });
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
      && (
        descriptionDraftRef.current === lastSyncedDescriptionRef.current
        // The store caught up with the draft (our own save landed): the saved
        // text is the new base, or the next save would be checked against an
        // old one and look like a teammate's change.
        || descriptionDraftRef.current === (task.description || '')
      )
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

  // Edits belong to the task they were made on: opening another task starts
  // from a clean slate without a reset effect.
  const currentEdits = ownEdits.taskId === selectedTaskId ? ownEdits.edits : NO_EDITS;

  const recordOwnEdits = useCallback((before: Task, updates: Partial<Task>) => {
    setOwnEdits((current) => ({
      taskId: before.id,
      edits: recordTaskOwnEdits(current.taskId === before.id ? current.edits : {}, before, updates),
    }));
  }, []);

  // Dirty only while one of our own edits still stands. A teammate's change
  // arriving through live sync is not ours to warn about or roll back.
  const isDirty = useMemo(() => (
    task ? hasTaskOwnEditsToRevert(currentEdits, task) : false
  ), [currentEdits, task]);

  const adoptDescription = useCallback((description: string) => {
    descriptionDraftRef.current = description;
    lastSyncedDescriptionRef.current = description;
    setDraftDescription(description);
  }, []);

  const markDescriptionSaved = useCallback((description: string) => {
    lastSyncedDescriptionRef.current = description;
  }, []);

  const forgetOwnEdits = useCallback((fields: TaskOwnEditField[]) => {
    setOwnEdits((current) => {
      const edits = { ...current.edits };
      for (const field of fields) delete edits[field];
      return { ...current, edits };
    });
  }, []);

  return {
    descriptionBaseRef: lastSyncedDescriptionRef,
    adoptDescription,
    markDescriptionSaved,
    forgetOwnEdits,
    ownEdits: currentEdits,
    recordOwnEdits,
    titleDraftRef,
    descriptionDraftRef,
    draftTitle,
    setDraftTitle,
    draftDescription,
    setDraftDescription,
    isDirty,
  };
};
