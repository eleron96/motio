import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { buildRepeatConfigSignature, type UseTaskRepeatConfigResult } from '@/features/planner/hooks/useTaskRepeatConfig';
import type { UseTaskDraftsResult } from '@/features/planner/hooks/useTaskDrafts';
import { buildCreateRepeatsOptions, resolveRepeatValidationMessage } from '@/features/planner/lib/taskFormRules';
import type { RepeatTaskUpdateScope, Task } from '@/features/planner/types/planner';

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

interface UseTaskRepeatSaveOptions {
  task: Task | undefined;
  canEdit: boolean;
  repeat: UseTaskRepeatConfigResult;
  drafts: Pick<
    UseTaskDraftsResult,
    'recordOwnEdits' | 'titleDraftRef' | 'setDraftTitle' | 'descriptionDraftRef' | 'setDraftDescription'
  >;
  /** Closes the card after a repeat change asked for it. */
  closeCard: () => void;
}

/**
 * Writing the repeat of the open task: creating the repeats on Done, and the
 * scope dialog ("only this", "this and following", "all") that a change to a
 * repeating task goes through — for its fields and for the repeat itself.
 */
export const useTaskRepeatSave = ({ task, canEdit, repeat, drafts, closeCard }: UseTaskRepeatSaveOptions) => {
  const { tasks, updateTask, createRepeats, updateRepeatSeries } = usePlannerStore(useShallow((state) => ({
    tasks: state.tasks,
    updateTask: state.updateTask,
    createRepeats: state.createRepeats,
    updateRepeatSeries: state.updateRepeatSeries,
  })));
  const {
    repeatFrequency,
    repeatEnds,
    repeatUntil,
    repeatCount,
    setRepeatError,
    setRepeatNotice,
    setRepeatCreating,
    setRepeatScopeOpen,
    pendingRepeatUpdate,
    setPendingRepeatUpdate,
    repeatInFlightRef,
    repeatConfigSnapshotRef,
  } = repeat;
  const { recordOwnEdits, titleDraftRef, setDraftTitle, descriptionDraftRef, setDraftDescription } = drafts;

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
      // A series-wide change was confirmed in the scope dialog and spans other
      // tasks, so Discard in this card doesn't roll it back.
      if (scope === 'single' && task?.id === pending.taskId) recordOwnEdits(task, updates);
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
      closeCard();
    }
  };

  const cancelPendingRepeatUpdate = () => {
    const pending = pendingRepeatUpdate;
    setPendingRepeatUpdate(null);
    setRepeatScopeOpen(false);
    if (!pending?.resetDraftOnCancel || !task) return;
    titleDraftRef.current = task.title;
    setDraftTitle(task.title);
    const nextDescription = task.description || '';
    descriptionDraftRef.current = nextDescription;
    setDraftDescription(nextDescription);
  };

  return { syncRepeatsOnSave, applyPendingRepeatUpdate, cancelPendingRepeatUpdate };
};
