import { Dispatch, SetStateAction, useEffect } from 'react';
import type { TaskComment } from '@/features/planner/types/planner';
import { subscribeToOpenTaskRows } from '@/infrastructure/tasks/openTaskLiveChannel';
import { fetchTaskCommentById } from '@/infrastructure/tasks/taskCommentsRepository';
import { applyLiveTaskComment } from '@/shared/domain/taskCommentFeed';

/**
 * Keeps an open card's comment feed live: a teammate's new, edited or deleted
 * comment shows up without reopening the task. The counter on the timeline is
 * kept by the workspace channel (usePlannerLiveSync), not here.
 */
export const useTaskCommentsLiveSync = (
  workspaceId: string,
  taskId: string,
  setComments: Dispatch<SetStateAction<TaskComment[]>>,
) => {
  useEffect(() => {
    if (!workspaceId || !taskId) return;
    let active = true;

    const unsubscribe = subscribeToOpenTaskRows('task_comments', taskId, (change) => {
      if (change.type === 'DELETE') {
        setComments((current) => applyLiveTaskComment(current, change.rowId, null));
        return;
      }
      void fetchTaskCommentById(workspaceId, taskId, change.rowId).then((result) => {
        if (!active || 'error' in result) return;
        setComments((current) => applyLiveTaskComment(current, change.rowId, result.data));
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setComments, taskId, workspaceId]);
};
