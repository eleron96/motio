export const applyTaskCommentCountDelta = (
  counts: Record<string, number>,
  taskId: string,
  delta: number,
): Record<string, number> => ({
  ...counts,
  [taskId]: Math.max(0, (counts[taskId] ?? 0) + delta),
});
