import React, { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { t } from '@lingui/macro';

import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { toast } from '@/shared/ui/sonner';
import { UserAvatar } from '@/shared/ui/UserAvatar';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import type { TaskComment } from '@/features/planner/types/planner';
import { sanitizeCommentHtml, deleteTaskComment, updateTaskComment } from '@/infrastructure/tasks/taskCommentsRepository';
import { type TaskCommentMentionCandidate } from '@/shared/domain/taskCommentMentionCandidates';
import { CommentEditor } from './CommentEditor';

export interface TaskCommentItemProps {
  comment: TaskComment;
  currentUserId: string | null;
  isAdmin: boolean;
  workspaceId: string;
  mentionCandidates: TaskCommentMentionCandidate[];
  mentionsLoading: boolean;
  onUpdated: (updated: TaskComment) => void;
  onDeleted: (id: string) => void;
}

export const TaskCommentItem: React.FC<TaskCommentItemProps> = ({
  comment,
  currentUserId,
  isAdmin,
  workspaceId,
  mentionCandidates,
  mentionsLoading,
  onUpdated,
  onDeleted,
}) => {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canEdit = comment.authorId === currentUserId;
  const canDelete = comment.authorId === currentUserId || isAdmin;

  const timeAgo = formatDistanceToNow(parseISO(comment.createdAt), {
    addSuffix: true,
  });

  const handleDelete = async () => {
    setDeleteLoading(true);
    const result = await deleteTaskComment(workspaceId, comment.id);
    setDeleteLoading(false);
    if (result.error) {
      toast(t`Failed to delete comment`, { description: result.error });
    } else {
      onDeleted(comment.id);
    }
    setDeleteOpen(false);
  };

  const handleSaveEdit = async (html: string) => {
    const result = await updateTaskComment(workspaceId, comment.id, html);
    if ('error' in result) {
      toast(t`Failed to update comment`, { description: result.error });
    } else {
      onUpdated(result.data);
      setEditing(false);
    }
  };

  return (
    <div className="group relative flex gap-2.5 py-2.5">
      {/* Avatar */}
      <PersonAvatar
        userId={comment.authorId}
        name={comment.authorDisplayName}
        avatarUrl={comment.authorAvatarUrl}
        colorSeed={comment.authorId}
        size="sm"
        className="mt-0.5 h-7 w-7 shrink-0 text-[10px]"
      />

      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="mb-0.5 flex flex-wrap items-baseline gap-1.5">
          <span
            className={
              comment.authorStatus === 'PURGED'
                ? 'text-sm font-medium leading-none italic text-muted-foreground'
                : 'text-sm font-medium leading-none'
            }
          >
            {comment.authorDisplayName}
          </span>
          <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
          {comment.isEdited && (
            <span className="text-[9px] text-muted-foreground/60">{t`(edited)`}</span>
          )}
        </div>

        {/* Body or editor */}
        {editing ? (
          <CommentEditor
            workspaceId={workspaceId}
            initialValue={comment.content}
            mentionCandidates={mentionCandidates}
            mentionsLoading={mentionsLoading}
            onSave={handleSaveEdit}
            onCancel={() => setEditing(false)}
            saveLabel={t`Update`}
          />
        ) : (
          <div
            className="comment-body rich-text-editor border-0 ring-0 p-0 min-h-0 text-sm"
            dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(comment.content) }}
          />
        )}
      </div>

      {/* Actions menu – shown on hover */}
      {(canEdit || canDelete) && !editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-2 h-6 w-6 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
              aria-label={t`Comment actions`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            {canEdit && (
              <DropdownMenuItem onClick={() => setEditing(true)}>
                {t`Edit`}
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                {t`Delete`}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete comment?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This comment will be permanently removed and cannot be recovered.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>
              {t`Cancel`}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
              disabled={deleteLoading}
            >
              {t`Delete`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
