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

/**
 * Re-applies the newest page after a reconnect (events may have been missed).
 * Every comment of the page replaces or joins its copy; a shown comment inside
 * the page's time span that the page no longer has was deleted meanwhile.
 * Comments older than the page (loaded with "load older") stay, and so do
 * ones newer than its newest — they arrived live while the page was on its way.
 *
 * `gap` is true when even the newest page doesn't reach what is shown (more
 * than a page was missed): the caller then shows just the page and points
 * "load older" at it, rather than leaving an invisible hole.
 */
export const mergeNewestTaskCommentPage = (
  comments: TaskComment[],
  page: TaskComment[],
  pageIsComplete: boolean,
): { comments: TaskComment[]; gap: boolean } => {
  const pageIds = new Set(page.map((item) => item.id));
  const oldestInPage = page[0]?.createdAt ?? null;
  const newestInPage = page[page.length - 1]?.createdAt ?? null;
  const newestShown = comments[comments.length - 1]?.createdAt ?? null;

  if (!pageIsComplete && oldestInPage !== null && newestShown !== null && newestShown < oldestInPage) {
    return { comments: page, gap: true };
  }

  const kept = comments.filter((item) => {
    if (pageIds.has(item.id)) return false;
    if (newestInPage !== null && item.createdAt > newestInPage) return true;
    // With the whole feed in the page, anything else missing from it is gone.
    if (pageIsComplete) return false;
    return oldestInPage !== null && item.createdAt < oldestInPage;
  });
  return {
    comments: [...kept, ...page].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    gap: false,
  };
};
