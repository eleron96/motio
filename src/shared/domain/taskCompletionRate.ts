/**
 * "Has this task already begun?" — true when its start date is today or
 * earlier. Future tasks are not late, so they stay out of completion rates.
 * Compares calendar days only (`yyyy-MM-dd`), so a start stored with a time
 * part still counts as started on that day.
 */
export const isTaskStartedBy = (startDate: string | null | undefined, todayKey: string): boolean => {
  if (!startDate) return false;
  return startDate.slice(0, 10) <= todayKey;
};

/** Whole-percent share of `completed` in `total`; 0 when there is nothing to count. */
export const toCompletionPercent = (completed: number, total: number): number => {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
};
