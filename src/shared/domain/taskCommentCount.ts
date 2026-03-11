export const buildTaskCommentCounts = (
  taskIds: string[],
  commentTaskIds: Array<string | null | undefined>,
): Record<string, number> => {
  const counts = Object.fromEntries(taskIds.map((taskId) => [taskId, 0])) as Record<string, number>;

  commentTaskIds.forEach((taskId) => {
    if (!taskId || !(taskId in counts)) return;
    counts[taskId] += 1;
  });

  return counts;
};

export const applyTaskCommentCountDelta = (
  counts: Record<string, number>,
  taskId: string,
  delta: number,
): Record<string, number> => ({
  ...counts,
  [taskId]: Math.max(0, (counts[taskId] ?? 0) + delta),
});
