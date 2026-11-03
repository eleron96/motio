import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { UseTaskDraftsResult } from '@/features/planner/hooks/useTaskDrafts';
import type { PendingRepeatUpdate } from '@/features/planner/hooks/useTaskRepeatConfig';
import type { useTaskDescriptionSave } from '@/features/planner/hooks/useTaskDescriptionSave';
import { hasTaskUpdates } from '@/shared/domain/taskUpdates';
import type { Task } from '@/features/planner/types/planner';

interface UseTaskDetailCloseOptions {
  task: Task | undefined;
  taskId: string | null;
  canEdit: boolean;
  setConfirmOpen: (open: boolean) => void;
  /** Title or description typed but not written yet. */
  isDirty: boolean;
  repeatConfigDirty: boolean;
  /** A subtask edit in progress. */
  subtaskEditingDirty: boolean;
  repeatScopeOpen: boolean;
  pendingRepeatUpdate: PendingRepeatUpdate | null;
  descriptionSave: ReturnType<typeof useTaskDescriptionSave>;
  syncRepeatsOnSave: () => Promise<boolean>;
  drafts: Pick<UseTaskDraftsResult, 'descriptionDraftRef' | 'recordOwnEdits' | 'ownEdits'>;
}

/**
 * Leaving the task card without losing work: the description is saved first
 * (and the card stays open on a teammate's conflicting edit), an unsent
 * comment and unsaved fields each ask before going, Discard rolls back only
 * this person's own edits, and Done writes what is pending.
 */
export const useTaskDetailClose = ({
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
}: UseTaskDetailCloseOptions) => {
  const { setSelectedTaskId, updateTask, revertTaskOwnEdits } = usePlannerStore(useShallow((state) => ({
    setSelectedTaskId: state.setSelectedTaskId,
    updateTask: state.updateTask,
    revertTaskOwnEdits: state.revertTaskOwnEdits,
  })));
  const {
    descriptionConflict,
    descriptionSavesConditionally,
    isDescriptionDraftPending,
    saveDescriptionDraft,
    pointAtDescriptionConflict,
  } = descriptionSave;
  const { descriptionDraftRef, recordOwnEdits, ownEdits } = drafts;
  const [commentDraftDirty, setCommentDraftDirty] = useState(false);
  const [commentConfirmOpen, setCommentConfirmOpen] = useState(false);

  useEffect(() => {
    setCommentDraftDirty(false);
    setCommentConfirmOpen(false);
  }, [taskId]);

  const requestClose = () => {
    if (descriptionSavesConditionally && (descriptionConflict || isDescriptionDraftPending())) {
      // Unsaved description text: save it first, and stay open if a teammate
      // changed the description meanwhile — the banner asks what to keep.
      if (descriptionConflict) {
        pointAtDescriptionConflict();
        return;
      }
      void saveDescriptionDraft().then((result) => {
        if (result === 'saved') closeIfClean();
      });
      return;
    }
    closeIfClean();
  };

  // An unsent comment would vanish with the card: closing asks first, and
  // «Discard» carries on with whatever close was asked for.
  const commentDiscardContinueRef = useRef<(() => void) | null>(null);
  const askAboutUnsentComment = (proceed: () => void) => {
    commentDiscardContinueRef.current = proceed;
    setCommentConfirmOpen(true);
  };
  const handleDiscardCommentAndContinue = () => {
    setCommentConfirmOpen(false);
    const proceed = commentDiscardContinueRef.current;
    commentDiscardContinueRef.current = null;
    proceed?.();
  };

  const closeIfClean = (commentChecked = false) => {
    if (!commentChecked && commentDraftDirty) {
      askAboutUnsentComment(() => closeIfClean(true));
      return;
    }
    // A subtask edit in progress also counts as unsaved work — warn before
    // closing so the changes aren't lost. A typed new-subtask draft doesn't:
    // leaving the task saves it as a subtask (useTaskSubtasks).
    if (!isDirty && !repeatConfigDirty && !subtaskEditingDirty) {
      setSelectedTaskId(null);
      return;
    }
    setConfirmOpen(true);
  };

  const handleSaveAndClose = async (commentChecked = false) => {
    if (repeatScopeOpen || pendingRepeatUpdate) return;
    if (!commentChecked && commentDraftDirty) {
      askAboutUnsentComment(() => { void handleSaveAndClose(true); });
      return;
    }
    // Flush unsaved description draft before closing.
    // onBlur of the rich-text editor is the normal save path, but it can be
    // skipped (React event batching) when the user clicks OK without first
    // moving focus away from the editor.
    // Guard: only flush when description has already been lazy-loaded
    // (undefined means "not yet fetched" — flushing null would corrupt the DB).
    if (descriptionSavesConditionally) {
      if (descriptionConflict) {
        pointAtDescriptionConflict();
        return;
      }
      const saved = await saveDescriptionDraft();
      if (saved !== 'saved') return;
    } else if (canEdit && task && task.description !== undefined) {
      const pendingDescription = descriptionDraftRef.current || null;
      if (hasTaskUpdates(task, { description: pendingDescription })) {
        recordOwnEdits(task, { description: pendingDescription });
        void updateTask(task.id, { description: pendingDescription }, 'single');
      }
    }
    const repeatsSynced = await syncRepeatsOnSave();
    if (!repeatsSynced) return;
    setConfirmOpen(false);
    setSelectedTaskId(null);
  };

  const handleDiscardAndClose = () => {
    // Roll back only what this person changed here; a teammate's edits that
    // live sync brought in meanwhile stay.
    if (task) void revertTaskOwnEdits(task.id, ownEdits);
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

  return {
    setCommentDraftDirty,
    commentConfirmOpen,
    setCommentConfirmOpen,
    requestClose,
    handleDiscardCommentAndContinue,
    handleSaveAndClose,
    handleDiscardAndClose,
    handleCancelClose,
  };
};
