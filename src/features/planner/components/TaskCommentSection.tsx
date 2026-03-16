import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { t } from '@lingui/macro';

import { Button } from '@/shared/ui/button';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/sonner';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { TaskComment } from '@/features/planner/types/planner';
import {
  createTaskComment,
  fetchTaskComments,
  extractMentionedUserIds,
} from '@/infrastructure/tasks/taskCommentsRepository';
import {
  buildTaskCommentMentionCandidates,
} from '@/shared/domain/taskCommentMentionCandidates';
import { CommentEditor } from './CommentEditor';
import { TaskCommentItem } from './TaskCommentItem';

const noopAdjustTaskCommentCount = () => undefined;
const noopRefreshTaskCommentCounts = async () => ({});

interface TaskCommentSectionProps {
  taskId: string;
  workspaceId: string;
  canEdit: boolean;
}

export const TaskCommentSection: React.FC<TaskCommentSectionProps> = ({
  taskId,
  workspaceId,
  canEdit,
}) => {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? null;
  const currentUserDisplayName = useAuthStore(
    (s) => s.profileDisplayName ?? s.user?.email ?? '',
  );
  const currentWorkspaceRole = useAuthStore((s) => s.currentWorkspaceRole);
  const workspaceMembers = useAuthStore((s) => s.members);
  const membersWorkspaceId = useAuthStore((s) => s.membersWorkspaceId);
  const membersLoading = useAuthStore((s) => s.membersLoading);
  const fetchMembers = useAuthStore((s) => s.fetchMembers);
  const isAdmin = currentWorkspaceRole === 'admin';
  const taskCommentCount = usePlannerStore((s) => s.taskCommentCounts?.[taskId] ?? 0);
  const adjustTaskCommentCount = usePlannerStore(
    (s) => s.adjustTaskCommentCount ?? noopAdjustTaskCommentCount,
  );
  const refreshTaskCommentCounts = usePlannerStore(
    (s) => s.refreshTaskCommentCounts ?? noopRefreshTaskCommentCounts,
  );

  const mentionCandidates = buildTaskCommentMentionCandidates(workspaceMembers);

  useEffect(() => {
    if (!workspaceId) return;
    if (membersWorkspaceId === workspaceId || membersLoading) return;
    void fetchMembers(workspaceId);
  }, [fetchMembers, membersLoading, membersWorkspaceId, workspaceId]);

  // ── load comments when the task opens
  useEffect(() => {
    if (!taskId || !workspaceId) return;

    let cancelled = false;
    setLoading(true);
    setComments([]);
    setNextCursor(null);
    void refreshTaskCommentCounts(workspaceId, [taskId]);

    fetchTaskComments(workspaceId, taskId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if ('error' in result) {
        toast(t`Failed to load comments`, { description: result.error });
        return;
      }
      setComments(result.data.comments);
      setNextCursor(result.data.nextCursor);
    });

    return () => { cancelled = true; };
  }, [refreshTaskCommentCounts, taskId, workspaceId]);

  // ── load more (older) comments
  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const result = await fetchTaskComments(workspaceId, taskId, nextCursor);
    setLoadingMore(false);
    if ('error' in result) {
      toast(t`Failed to load comments`, { description: result.error });
      return;
    }
    // Older comments go to the TOP of the list
    setComments((prev) => [...result.data.comments, ...prev]);
    setNextCursor(result.data.nextCursor);
  };

  // ── create new comment
  const handleCreate = async (html: string) => {
    if (!currentUserId) {
      const message = t`You need to sign in again before adding comments.`;
      toast(t`Failed to add comment`, { description: message });
      throw new Error(message);
    }
    const mentionedUserIds = extractMentionedUserIds(html);
    const result = await createTaskComment({
      workspaceId,
      taskId,
      authorId: currentUserId,
      authorDisplayNameSnapshot: currentUserDisplayName,
      content: html,
    });
    if ('error' in result) {
      toast(t`Failed to add comment`, { description: result.error });
      throw new Error(result.error);
    }
    // Optimistic: append at the end (newest last)
    setComments((prev) => [...prev, result.data]);
    adjustTaskCommentCount(taskId, 1);
    void refreshTaskCommentCounts(workspaceId, [taskId]);
    void mentionedUserIds; // handled server-side via trigger
  };

  // ── callbacks for child items
  const handleUpdated = useCallback((updated: TaskComment) => {
    setComments((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    adjustTaskCommentCount(taskId, -1);
    void refreshTaskCommentCounts(workspaceId, [taskId]);
  }, [adjustTaskCommentCount, refreshTaskCommentCounts, taskId, workspaceId]);

  return (
    <div className="space-y-2 pt-1">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t`Comments`}
        </span>
        {taskCommentCount > 0 && (
          <span className="text-[9px] text-muted-foreground/70 tabular-nums">
            {taskCommentCount}
          </span>
        )}
      </div>

      {/* Comment list */}
      <ScrollArea className="max-h-[50vh]">
        <div className="pr-2">
          {/* Load more (older) */}
          {nextCursor && (
            <div className="mb-1 flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? t`Loading...` : t`Load older comments`}
              </Button>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-3 py-2">
              {[1, 2].map((n) => (
                <div key={n} className="flex gap-2.5">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && comments.length === 0 && !canEdit && (
            <p className="py-3 text-center text-xs text-muted-foreground">
              {t`Add a comment or update`}
            </p>
          )}

          {/* Comments */}
          {!loading &&
            comments.map((comment) => (
              <React.Fragment key={comment.id}>
                <TaskCommentItem
                  comment={comment}
                  currentUserId={currentUserId ?? null}
                  isAdmin={isAdmin}
                  workspaceId={workspaceId}
                  mentionCandidates={mentionCandidates}
                  mentionsLoading={membersLoading}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
                <div className="border-b border-border/50 last:hidden" />
              </React.Fragment>
            ))}
        </div>
      </ScrollArea>

      {/* New comment editor */}
      {canEdit && (
        <CommentEditor
          workspaceId={workspaceId}
          mentionCandidates={mentionCandidates}
          mentionsLoading={membersLoading}
          onSave={handleCreate}
          placeholder={t`Add a comment or update...`}
        />
      )}
    </div>
  );
};

export default TaskCommentSection;
