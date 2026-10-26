import { useMemo } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { pruneToWindow } from '@/shared/domain/taskLoadScopes';
import type { Task } from '@/features/planner/types/planner';

/**
 * Tasks the timeline and the calendar draw: the cache limited to the loaded
 * date window. Row heights are computed from every task of a row, so tasks the
 * board scope pulled in from far outside the window (e.g. next year's repeat
 * occurrences) must not reach the timeline, or rows would grow for no visible
 * reason. Without a board scope the cache is returned as is — same reference,
 * zero cost.
 */
export const useTimelineTasks = (): Task[] => {
  const tasks = usePlannerStore((state) => state.tasks);
  const loadedRange = usePlannerStore((state) => state.loadedRange);
  // Boolean(): partial store mocks in tests lack the field entirely.
  const boardActive = usePlannerStore((state) => Boolean(state.boardScope));

  return useMemo(
    () => (boardActive && loadedRange ? pruneToWindow(tasks, loadedRange) : tasks),
    [boardActive, loadedRange, tasks],
  );
};
