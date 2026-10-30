import { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import type { TaskComment } from '@/features/planner/types/planner';
import { subscribeToOpenTaskRows } from '@/infrastructure/tasks/openTaskLiveChannel';
import { fetchTaskCommentById, fetchTaskComments } from '@/infrastructure/tasks/taskCommentsRepository';
import { applyLiveTaskComment, mergeNewestTaskCommentPage } from '@/shared/domain/taskCommentFeed';

/**
 * Keeps an open card's comment feed live: a teammate's new, edited or deleted
 * comment shows up without reopening the task. The counter on the timeline is
 * kept by the workspace channel (usePlannerLiveSync), not here.
 *
 * After a (re)subscribe or a return to the tab the newest page is re-read —
 * one request at a time, and its answer is dropped (and asked again) when a
 * live event landed while it was on its way, so a late page never undoes it.
 */
export const useTaskCommentsLiveSync = (
  workspaceId: string,
  taskId: string,
  comments: TaskComment[],
  setComments: Dispatch<SetStateAction<TaskComment[]>>,
  setNextCursor: Dispatch<SetStateAction<string | null>>,
) => {
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  useEffect(() => {
    if (!workspaceId || !taskId) return;
    let active = true;
    let generation = 0;
    let resyncInFlight = false;
    let resyncAgain = false;

    const resync = () => {
      if (resyncInFlight) {
        resyncAgain = true;
        return;
      }
      resyncInFlight = true;
      const startedAt = generation;
      void fetchTaskComments(workspaceId, taskId).then((result) => {
        resyncInFlight = false;
        if (!active) return;
        if (generation !== startedAt || resyncAgain) {
          resyncAgain = false;
          resync();
          return;
        }
        if ('error' in result) return;
        const merged = mergeNewestTaskCommentPage(
          commentsRef.current,
          result.data.comments,
          result.data.nextCursor === null,
        );
        setComments(merged.comments);
        if (merged.gap) setNextCursor(result.data.nextCursor);
      });
    };

    const unsubscribe = subscribeToOpenTaskRows('task_comments', taskId, (change) => {
      generation += 1;
      if (change.type === 'DELETE') {
        setComments((current) => applyLiveTaskComment(current, change.rowId, null));
        return;
      }
      void fetchTaskCommentById(workspaceId, taskId, change.rowId).then((result) => {
        if (!active || 'error' in result) return;
        setComments((current) => applyLiveTaskComment(current, change.rowId, result.data));
      });
    }, resync);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setComments, setNextCursor, taskId, workspaceId]);
};
