import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { buildRepeatSeriesRows } from '@/shared/domain/repeatSeriesRows';
import {
  shouldCollapseRepeatSeriesInTaskScope,
  type TaskScope,
} from '@/shared/domain/taskScope';
import type { Task } from '@/features/planner/types/planner';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';

export type DisplayTaskRow = {
  key: string;
  task: Task;
  taskIds: string[];
  repeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
};

/** Picks the repeat-series occurrence closest to today (used for "open in timeline"). */
export const pickNearestRepeatTaskFromToday = (task: Task, tasks: Task[]): Task => {
  if (!task.repeatId) return task;

  const series = tasks.filter((item) => item.repeatId === task.repeatId);
  if (series.length === 0) return task;

  const todayTime = parseISO(format(new Date(), 'yyyy-MM-dd')).getTime();
  return series.reduce((best, candidate) => {
    const bestDiff = parseISO(best.startDate).getTime() - todayTime;
    const candidateDiff = parseISO(candidate.startDate).getTime() - todayTime;

    const bestDistance = Math.abs(bestDiff);
    const candidateDistance = Math.abs(candidateDiff);
    if (candidateDistance < bestDistance) return candidate;
    if (candidateDistance > bestDistance) return best;

    const bestIsFutureOrToday = bestDiff >= 0;
    const candidateIsFutureOrToday = candidateDiff >= 0;
    if (candidateIsFutureOrToday && !bestIsFutureOrToday) return candidate;
    if (!candidateIsFutureOrToday && bestIsFutureOrToday) return best;

    return parseISO(candidate.startDate) < parseISO(best.startDate) ? candidate : best;
  });
};

/** Counts distinct task units: repeat-series count as one unit each. */
export const countTaskUnits = (tasks: Task[]): number => {
  const units = new Set<string>();
  tasks.forEach((task) => {
    units.add(task.repeatId ? `r:${task.repeatId}` : `t:${task.id}`);
  });
  return units.size;
};

/**
 * Collapses repeat-series into a single row when the task scope calls for it.
 * Each row carries `taskIds` (all task IDs in the series) for bulk operations.
 */
export function useDisplayTaskRows(tasks: Task[], taskScope: TaskScope): DisplayTaskRow[] {
  return useMemo<DisplayTaskRow[]>(() => {
    if (!shouldCollapseRepeatSeriesInTaskScope(taskScope)) {
      return tasks.map((task) => ({
        key: task.id,
        task,
        taskIds: [task.id],
        repeatMeta: null,
      }));
    }

    return buildRepeatSeriesRows(tasks).map((row) => ({
      key: row.key,
      task: row.task,
      taskIds: row.taskIds,
      repeatMeta: row.repeatMeta
        ? {
          cadence: row.repeatMeta.cadence,
          remaining: row.repeatMeta.remaining,
          total: row.repeatMeta.total,
        }
        : null,
    }));
  }, [tasks, taskScope]);
}
