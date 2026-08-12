import { useEffect } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { needsAssigneeGroupingToRevealTask } from '@/shared/domain/timelineTaskReveal';

/**
 * Stop waiting for a task that never arrives (deleted, access lost, or simply
 * outside every window the user visits) so a stale intent can't fire hours
 * later and switch grouping out of nowhere.
 */
const GIVE_UP_MS = 15000;

/**
 * Completes a deep link whose task wasn't loaded yet at click time: the bell
 * only knows the task id, and the task itself may live outside the currently
 * loaded date window. Once it shows up, the project board is checked — if the
 * task's project is archived (and therefore has no row there), grouping flips
 * to people, where every task is always visible.
 */
export const useRevealPendingTask = () => {
  const pendingRevealTaskId = usePlannerStore((state) => state.pendingRevealTaskId);
  const tasks = usePlannerStore((state) => state.tasks);

  useEffect(() => {
    if (!pendingRevealTaskId) return;
    const task = tasks.find((item) => item.id === pendingRevealTaskId);
    if (!task) return;

    const store = usePlannerStore.getState();
    if (needsAssigneeGroupingToRevealTask({
      task,
      projects: store.projects,
      assignees: store.assignees,
      groupMode: store.groupMode,
    })) {
      store.setGroupMode('assignee');
    }
    store.setPendingRevealTaskId(null);
  }, [pendingRevealTaskId, tasks]);

  useEffect(() => {
    if (!pendingRevealTaskId) return;
    const handle = window.setTimeout(() => {
      usePlannerStore.getState().setPendingRevealTaskId(null);
    }, GIVE_UP_MS);
    return () => window.clearTimeout(handle);
  }, [pendingRevealTaskId]);
};
