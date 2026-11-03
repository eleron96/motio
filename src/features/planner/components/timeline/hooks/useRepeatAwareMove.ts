import { useCallback, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { RepeatTaskUpdateScope, Task } from '@/features/planner/types/planner';

type PendingRepeatMove = {
  endDate: string;
  startDate: string;
};

/**
 * Moves a dragged task to new dates. A task of a series first asks which
 * occurrences to move; "only this one" takes it out of the series.
 */
export const useRepeatAwareMove = (task: Task) => {
  const moveTask = usePlannerStore((state) => state.moveTask);
  const moveTaskDetached = usePlannerStore((state) => state.moveTaskDetached);
  const [pendingRepeatMove, setPendingRepeatMove] = useState<PendingRepeatMove | null>(null);
  const [repeatScopeOpen, setRepeatScopeOpen] = useState(false);

  const requestMoveTask = useCallback((startDate: string, endDate: string) => {
    if (!task.repeatId) {
      void moveTask(task.id, startDate, endDate, 'single');
      return;
    }

    setPendingRepeatMove({ startDate, endDate });
    setRepeatScopeOpen(true);
  }, [moveTask, task.id, task.repeatId]);

  const applyPendingRepeatMove = useCallback(async (scope: RepeatTaskUpdateScope) => {
    const pendingMove = pendingRepeatMove;
    if (!pendingMove) return;
    setPendingRepeatMove(null);
    setRepeatScopeOpen(false);
    if (scope === 'single') {
      // "Only this task" detaches the occurrence from its series (repeatId: null)
      // so future moves/edits treat it as standalone and never ask for scope again.
      await moveTaskDetached(task.id, pendingMove.startDate, pendingMove.endDate);
      return;
    }
    await moveTask(task.id, pendingMove.startDate, pendingMove.endDate, scope);
  }, [moveTask, moveTaskDetached, pendingRepeatMove, task.id]);

  const cancelPendingRepeatMove = useCallback(() => {
    setPendingRepeatMove(null);
    setRepeatScopeOpen(false);
  }, []);

  return {
    requestMoveTask,
    repeatScopeOpen,
    setRepeatScopeOpen,
    applyPendingRepeatMove,
    cancelPendingRepeatMove,
  };
};
