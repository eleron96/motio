import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Task } from '@/features/planner/types/planner';

export type DailyBriefBuckets = {
  overdue: Task[];
  today: Task[];
};

/**
 * Splits the urgent-task fetch (everything with end_date <= today) into the two
 * buckets the brief shows: strictly before today is overdue, due today is
 * "today". The two never overlap and together cover the whole fetch — nothing
 * in the future is fetched at all, only milestones look ahead.
 *
 * Dates are plain `yyyy-MM-dd` straight from the DB, so string comparison is
 * exact and timezone-free.
 */
export const splitDailyBriefTasks = (tasks: Task[], todayKey: string): DailyBriefBuckets => {
  const overdue: Task[] = [];
  const today: Task[] = [];

  for (const task of tasks) {
    if (task.endDate === todayKey) {
      today.push(task);
    } else if (task.endDate < todayKey) {
      overdue.push(task);
    }
  }

  return { overdue, today };
};

/** Whole days between an overdue task's due date and today; never negative. */
export const getOverdueDays = (endDate: string, todayKey: string): number => (
  Math.max(0, differenceInCalendarDays(parseISO(todayKey), parseISO(endDate)))
);
