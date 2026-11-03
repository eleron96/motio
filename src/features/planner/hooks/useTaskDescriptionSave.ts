import { useEffect, useRef, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { UseTaskDraftsResult } from '@/features/planner/hooks/useTaskDrafts';
import type { Task } from '@/features/planner/types/planner';

type DescriptionSaveResult = 'saved' | 'conflict' | 'failed';

interface UseTaskDescriptionSaveOptions {
  task: Task | undefined;
  selectedTaskId: string | null;
  canEdit: boolean;
  drafts: Pick<
    UseTaskDraftsResult,
    | 'recordOwnEdits'
    | 'descriptionDraftRef'
    | 'descriptionBaseRef'
    | 'adoptDescription'
    | 'markDescriptionSaved'
    | 'forgetOwnEdits'
  >;
}

/**
 * The description is saved only over the text the person started from; a
 * teammate's newer one is never overwritten silently (migration 0162).
 * Repeating tasks keep the scope dialog's path, which writes the series.
 */
export const useTaskDescriptionSave = ({
  task,
  selectedTaskId,
  canEdit,
  drafts,
}: UseTaskDescriptionSaveOptions) => {
  const saveTaskDescription = usePlannerStore((state) => state.saveTaskDescription);
  const {
    recordOwnEdits,
    descriptionDraftRef,
    descriptionBaseRef,
    adoptDescription,
    markDescriptionSaved,
    forgetOwnEdits,
  } = drafts;
  const [descriptionConflict, setDescriptionConflict] = useState(false);
  const descriptionConflictRef = useRef<HTMLDivElement | null>(null);
  // Saves run one after another, each checked against the base the previous
  // one left: a second save started while the first is in flight would
  // otherwise be checked against the old base and look like a teammate's.
  const descriptionSaveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const descriptionInFlightRef = useRef<{ text: string | null; promise: Promise<DescriptionSaveResult> } | null>(null);
  const selectedTaskIdRef = useRef(selectedTaskId);
  selectedTaskIdRef.current = selectedTaskId;
  const taskRef = useRef(task);
  taskRef.current = task;
  useEffect(() => {
    setDescriptionConflict(false);
    descriptionInFlightRef.current = null;
  }, [selectedTaskId]);

  const descriptionSavesConditionally = Boolean(task && !task.repeatId);
  const isDescriptionDraftPending = () => (
    Boolean(task && task.description !== undefined)
    && (descriptionDraftRef.current || '') !== (descriptionBaseRef.current || '')
  );

  const saveDescriptionDraft = (options: { force?: boolean } = {}): Promise<DescriptionSaveResult> => {
    if (!canEdit || !task || task.description === undefined) return Promise.resolve('saved');
    const taskIdAtCall = task.id;
    const next = descriptionDraftRef.current || null;
    // Blur and Done can both ask for the same text; one request answers both.
    const inFlight = descriptionInFlightRef.current;
    if (!options.force && inFlight && inFlight.text === next) return inFlight.promise;

    const run = async (): Promise<DescriptionSaveResult> => {
      if (selectedTaskIdRef.current !== taskIdAtCall) return 'saved';
      // Read the base only now, after any earlier save has moved it.
      const base = descriptionBaseRef.current || null;
      if (!options.force && (next ?? '') === (base ?? '')) return 'saved';
      const before = taskRef.current;
      const result = await saveTaskDescription(taskIdAtCall, next, base, options);
      // The card moved on to another task: this answer is not its business.
      if (selectedTaskIdRef.current !== taskIdAtCall) return result;
      if (result === 'saved') {
        markDescriptionSaved(next || '');
        // Own edit from what was really overwritten: our base, or with
        // "Keep mine" the teammate's text — so Discard brings that back.
        if (before) {
          recordOwnEdits(
            { ...before, description: options.force ? (before.description ?? null) : base },
            { description: next },
          );
        }
        setDescriptionConflict(false);
      } else if (result === 'conflict') {
        setDescriptionConflict(true);
      }
      return result;
    };
    const promise = descriptionSaveChainRef.current.then(run, run);
    descriptionSaveChainRef.current = promise.catch(() => undefined);
    descriptionInFlightRef.current = { text: next, promise };
    void promise.finally(() => {
      if (descriptionInFlightRef.current?.promise === promise) descriptionInFlightRef.current = null;
    });
    return promise;
  };

  const takeTeammateDescription = () => {
    adoptDescription(taskRef.current?.description || '');
    // Their text is now what we start from: Discard must not roll it back.
    forgetOwnEdits(['description']);
    setDescriptionConflict(false);
  };

  // Closing is held while the description conflict is open; say why instead
  // of a close button that silently does nothing.
  const pointAtDescriptionConflict = () => {
    const banner = descriptionConflictRef.current;
    banner?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    banner?.querySelector<HTMLButtonElement>('button')?.focus();
  };

  return {
    descriptionConflict,
    descriptionConflictRef,
    descriptionSavesConditionally,
    isDescriptionDraftPending,
    saveDescriptionDraft,
    takeTeammateDescription,
    pointAtDescriptionConflict,
  };
};
