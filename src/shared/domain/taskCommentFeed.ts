import type { TaskComment } from '@/features/planner/types/planner';

/**
 * Applies one live change to an open card's comment feed (oldest first).
 * `comment` is the row as re-read from the server, `null` when it is gone or
 * soft-deleted. An already shown comment is replaced in place — that is also
 * how our own just-posted comment, echoed back by realtime, avoids a double.
 */
export const applyLiveTaskComment = (
  comments: TaskComment[],
  commentId: string,
  comment: TaskComment | null,
): TaskComment[] => {
  if (!comment) {
    return comments.some((item) => item.id === commentId)
      ? comments.filter((item) => item.id !== commentId)
      : comments;
  }
  if (comments.some((item) => item.id === commentId)) {
    return comments.map((item) => (item.id === commentId ? comment : item));
  }
  const insertAt = comments.findIndex((item) => item.createdAt > comment.createdAt);
  if (insertAt === -1) return [...comments, comment];
  return [...comments.slice(0, insertAt), comment, ...comments.slice(insertAt)];
};
