import { supabase } from '@/shared/lib/supabaseClient';
import { sanitizeCommentRichText } from '@/shared/lib/sanitizer';
import type { CommentAuthorStatus, TaskComment } from '@/features/planner/types/planner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMENT_PAGE_SIZE = 20;
const TASK_COMMENT_SELECT = `id,
       task_id,
       author_id,
       author_display_name_snapshot,
       content,
       mentioned_user_ids,
       created_at,
       updated_at,
       deleted_at`;

// Maximum plain-text length enforced on the client (DB stores sanitized HTML
// which is longer, but we cap the text representation at 1000 chars).
export const COMMENT_MAX_PLAIN_LENGTH = 1000;

// ---------------------------------------------------------------------------
// Sanitisation
// ---------------------------------------------------------------------------

export const sanitizeCommentHtml = sanitizeCommentRichText;

/**
 * Returns the plain-text character count (strips HTML tags).
 */
export const getCommentPlainLength = (html: string): number => {
  if (typeof window === 'undefined') return html.length;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent ?? tmp.innerText ?? '').replace(/\u00a0/g, ' ').trim().length;
};

/**
 * Extracts all mentioned user IDs from comment HTML.
 * Expects: <span data-mention-user-id="uuid" ...>…</span>
 */
export const extractMentionedUserIds = (html: string): string[] => {
  if (typeof window === 'undefined') return [];
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const ids: string[] = [];
  tmp.querySelectorAll('[data-mention-user-id]').forEach((el) => {
    const id = el.getAttribute('data-mention-user-id');
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
};

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

interface CommentRow {
  id: string;
  task_id: string;
  author_id: string;
  author_display_name: string | null;
  author_avatar_url: string | null;
  author_status: CommentAuthorStatus | null;
  author_display_name_snapshot: string;
  content: string;
  mentioned_user_ids: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface CommentAuthorProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  status: CommentAuthorStatus | null;
}

const normalizeAuthorStatus = (value: unknown): CommentAuthorStatus => {
  if (value === 'PENDING_DELETION' || value === 'PURGED') return value;
  return 'ACTIVE';
};

const mapCommentRow = (row: CommentRow): TaskComment => {
  const createdMs = new Date(row.created_at).getTime();
  const updatedMs = new Date(row.updated_at).getTime();
  return {
    id: row.id,
    taskId: row.task_id,
    authorId: row.author_id,
    // Prefer live display_name from profiles join; fall back to snapshot if
    // the user's account has been deleted.
    authorDisplayName:
      row.author_display_name ?? row.author_display_name_snapshot,
    authorAvatarUrl: row.author_avatar_url,
    authorStatus: normalizeAuthorStatus(row.author_status),
    content: row.content,
    mentionedUserIds: row.mentioned_user_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isEdited: updatedMs - createdMs > 1000,
  };
};

interface CommentAuthorMeta {
  displayName: string | null;
  avatarUrl: string | null;
  status: CommentAuthorStatus;
}

const loadCommentAuthorMeta = async (
  authorIds: string[],
): Promise<Map<string, CommentAuthorMeta>> => {
  const uniqueAuthorIds = Array.from(new Set(authorIds.filter(Boolean)));
  if (uniqueAuthorIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, status')
    .in('id', uniqueAuthorIds);

  if (error) {
    return new Map();
  }

  return new Map(
    ((data ?? []) as CommentAuthorProfileRow[]).map((row) => [
      row.id,
      {
        displayName: row.display_name ?? null,
        avatarUrl: row.avatar_url ?? null,
        status: normalizeAuthorStatus(row.status),
      },
    ]),
  );
};

const mapCommentRows = async (rows: CommentRow[]): Promise<TaskComment[]> => {
  const authorMeta = await loadCommentAuthorMeta(rows.map((row) => row.author_id));

  return rows.map((row) => {
    const meta = authorMeta.get(row.author_id);
    return mapCommentRow({
      ...row,
      author_display_name: meta?.displayName ?? null,
      author_avatar_url: meta?.avatarUrl ?? null,
      author_status: meta?.status ?? 'ACTIVE',
    });
  });
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchCommentsResult {
  comments: TaskComment[];
  /** Cursor for the next page (created_at of last item), or null if no more. */
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Fetch (paginated, old → new, with profiles join)
// ---------------------------------------------------------------------------

export const fetchTaskComments = async (
  workspaceId: string,
  taskId: string,
  cursor?: string | null,
  limit = COMMENT_PAGE_SIZE,
): Promise<{ data: FetchCommentsResult } | { error: string }> => {
  // We JOIN profiles to get the live display_name.
  // Supabase PostgREST supports embedded resource selects for FK relations.
  let query = supabase
    .from('task_comments')
    .select(TASK_COMMENT_SELECT)
    .eq('workspace_id', workspaceId)
    .eq('task_id', taskId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit + 1); // fetch one extra to detect if more pages exist

  // Cursor: only fetch comments created after the cursor (for "load more older")
  // We actually load old→new and want to load *more* items (going back in time).
  // The cursor represents the earliest createdAt we have loaded so far.
  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data, error } = await query;

  if (error) return { error: error.message };

  const rows = (data ?? []) as CommentRow[];

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const comments = await mapCommentRows(pageRows);

  return {
    data: {
      comments,
      nextCursor: hasMore ? pageRows[0].created_at : null,
    },
  };
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateCommentParams {
  workspaceId: string;
  taskId: string;
  authorId: string;
  authorDisplayNameSnapshot: string;
  content: string;
}

export const createTaskComment = async (
  params: CreateCommentParams,
): Promise<{ data: TaskComment } | { error: string }> => {
  const sanitized = sanitizeCommentHtml(params.content);
  const mentionedUserIds = extractMentionedUserIds(sanitized);

  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      task_id: params.taskId,
      workspace_id: params.workspaceId,
      author_id: params.authorId,
      author_display_name_snapshot: params.authorDisplayNameSnapshot,
      content: sanitized,
      mentioned_user_ids: mentionedUserIds,
    })
    .select(TASK_COMMENT_SELECT)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'No data returned' };

  const [comment] = await mapCommentRows([data as CommentRow]);

  return {
    data: comment,
  };
};

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export const updateTaskComment = async (
  workspaceId: string,
  commentId: string,
  content: string,
): Promise<{ data: TaskComment } | { error: string }> => {
  const sanitized = sanitizeCommentHtml(content);
  const mentionedUserIds = extractMentionedUserIds(sanitized);

  const { data, error } = await supabase
    .from('task_comments')
    .update({
      content: sanitized,
      mentioned_user_ids: mentionedUserIds,
    })
    .eq('id', commentId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .select(TASK_COMMENT_SELECT)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Comment not found or no permission.' };

  const [comment] = await mapCommentRows([data as CommentRow]);

  return {
    data: comment,
  };
};

// ---------------------------------------------------------------------------
// Soft-delete
// ---------------------------------------------------------------------------

export const deleteTaskComment = async (
  workspaceId: string,
  commentId: string,
): Promise<{ error?: string }> => {
  const { data, error } = await supabase.rpc('soft_delete_task_comment', {
    target_workspace_id: workspaceId,
    target_comment_id: commentId,
  });
  if (error) return { error: error.message };
  if (!data) return { error: 'Comment not found or no permission.' };
  return {};
};

// ---------------------------------------------------------------------------
// Count (lightweight, for TaskBar badge)
// ---------------------------------------------------------------------------

export const fetchTaskCommentCount = async (
  workspaceId: string,
  taskId: string,
): Promise<number> => {
  const { count, error } = await supabase
    .from('task_comments')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('task_id', taskId)
    .is('deleted_at', null);

  if (error || count === null) return 0;
  return count;
};

export const fetchTaskCommentCounts = async (
  workspaceId: string,
  taskIds: string[],
): Promise<{ data: Record<string, number> } | { error: string }> => {
  const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)));
  if (uniqueTaskIds.length === 0) {
    return { data: {} };
  }

  const { data, error } = await supabase.rpc('task_comment_counts_batch', {
    p_workspace_id: workspaceId,
    p_task_ids: uniqueTaskIds,
  });

  if (error) return { error: error.message };

  const counts: Record<string, number> = Object.fromEntries(
    uniqueTaskIds.map((id) => [id, 0]),
  );
  for (const row of (data ?? []) as Array<{ task_id: string; comment_count: number }>) {
    counts[row.task_id] = Number(row.comment_count);
  }

  return { data: counts };
};
