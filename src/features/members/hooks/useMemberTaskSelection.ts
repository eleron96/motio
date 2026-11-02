import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { Task } from '@/features/planner/types/planner';

interface UseMemberTaskSelectionOptions {
  /** Every task id the list shows now; a repeat-series row stands for several. */
  visibleTaskIds: string[];
  deleteTasks: (taskIds: string[]) => Promise<{ error?: string } | undefined | void>;
  tasksLoading: boolean;
  setTasksLoading: (loading: boolean) => void;
  setTasksError: (error: string) => void;
  setAssigneeTasks: Dispatch<SetStateAction<Task[]>>;
  setTotalCount: Dispatch<SetStateAction<number>>;
  refreshMemberTaskCounts: () => Promise<void>;
}

/** Ticking tasks in a member's list and deleting the ticked ones. */
export const useMemberTaskSelection = ({
  visibleTaskIds,
  deleteTasks,
  tasksLoading,
  setTasksLoading,
  setTasksError,
  setAssigneeTasks,
  setTotalCount,
  refreshMemberTaskCounts,
}: UseMemberTaskSelectionOptions) => {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const allVisibleSelected = visibleTaskIds.length > 0 && visibleTaskIds.every((id) => selectedTaskIds.has(id));
  const someVisibleSelected = visibleTaskIds.some((id) => selectedTaskIds.has(id));
  const selectedCount = selectedTaskIds.size;

  const handleToggleAll = (value: boolean | 'indeterminate') => {
    if (value === true) {
      setSelectedTaskIds(new Set(visibleTaskIds));
    } else {
      setSelectedTaskIds(new Set());
    }
  };

  const handleToggleTask = (taskIds: string[], value: boolean | 'indeterminate') => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (value === true) {
        taskIds.forEach((taskId) => next.add(taskId));
      } else {
        taskIds.forEach((taskId) => next.delete(taskId));
      }
      return next;
    });
  };

  const handleDeleteSelected = useCallback(async () => {
    if (!selectedCount || tasksLoading) return;
    setTasksLoading(true);
    setTasksError('');
    const ids = Array.from(selectedTaskIds);
    const result = await deleteTasks(ids);
    if (result?.error) {
      setTasksError(result.error);
      setTasksLoading(false);
      return;
    }
    setAssigneeTasks((current) => current.filter((task) => !selectedTaskIds.has(task.id)));
    setTotalCount((current) => Math.max(0, current - ids.length));
    setSelectedTaskIds(new Set());
    await refreshMemberTaskCounts();
    setTasksLoading(false);
  }, [deleteTasks, refreshMemberTaskCounts, selectedCount, selectedTaskIds, tasksLoading]);

  return {
    selectedTaskIds,
    setSelectedTaskIds,
    allVisibleSelected,
    someVisibleSelected,
    selectedCount,
    handleToggleAll,
    handleToggleTask,
    handleDeleteSelected,
  };
};
