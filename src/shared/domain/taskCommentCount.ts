export const TASK_COMMENT_QUERY_BATCH_SIZE = 75;

export const batchTaskCommentTaskIds = (
  taskIds: Array<string | null | undefined>,
  batchSize = TASK_COMMENT_QUERY_BATCH_SIZE,
): string[][] => {
  const normalizedBatchSize = Math.max(1, Math.trunc(batchSize) || TASK_COMMENT_QUERY_BATCH_SIZE);
  const uniqueTaskIds = Array.from(new Set(taskIds.filter((taskId): taskId is string => Boolean(taskId))));

  if (uniqueTaskIds.length === 0) {
    return [];
  }

  const batches: string[][] = [];
  for (let index = 0; index < uniqueTaskIds.length; index += normalizedBatchSize) {
    batches.push(uniqueTaskIds.slice(index, index + normalizedBatchSize));
  }

  return batches;
};

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
