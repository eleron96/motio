import { useEffect, useRef } from 'react';
import { t } from '@lingui/macro';
import { toast } from '@/shared/ui/sonner';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { TaskWriteFailure } from '@/features/planner/store/plannerStore.helpers';

const failureMessage = (failure: TaskWriteFailure): string => (
  failure.kind === 'delete'
    ? t`Couldn't delete the task. It's back in place.`
    : t`Couldn't save the task. Check your connection and try again.`
);

/**
 * Error toast for every task write the server rejected (edit, move, duplicate,
 * delete). Mounted once on PlannerPage next to the undo toasts. A failure that
 * happened before mount is not replayed.
 */
export const useTaskWriteFailureToasts = () => {
  const failure = usePlannerStore((state) => state.taskWriteFailure);
  const shownFailure = useRef(failure);

  useEffect(() => {
    if (!failure || failure === shownFailure.current) return;
    shownFailure.current = failure;
    toast.error(failureMessage(failure));
  }, [failure]);
};
