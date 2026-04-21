import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    rpc: supabaseMocks.rpc,
    from: supabaseMocks.from,
  },
}));

import {
  deleteTaskComment,
  fetchTaskCommentCounts,
  fetchTaskComments,
} from '@/infrastructure/tasks/taskCommentsRepository';

describe('taskCommentsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft deletes a comment in the current workspace', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: true, error: null });

    const result = await deleteTaskComment('ws-1', 'comment-1');

    expect(result).toEqual({});
    expect(supabaseMocks.rpc).toHaveBeenCalledWith('soft_delete_task_comment', {
      target_workspace_id: 'ws-1',
      target_comment_id: 'comment-1',
    });
  });

  it('returns the database error for soft delete failures', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { message: 'rls denied' } });

    const result = await deleteTaskComment('ws-1', 'comment-1');

    expect(result).toEqual({ error: 'rls denied' });
  });

  it('returns a predictable error when no comment was deleted', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: false, error: null });

    const result = await deleteTaskComment('ws-1', 'comment-1');

    expect(result).toEqual({ error: 'Comment not found or no permission.' });
  });

  it('fetches comment counts via RPC and fills zeros for tasks without comments', async () => {
    const taskIds = ['task-0', 'task-1', 'task-2'];

    supabaseMocks.rpc.mockResolvedValue({
      data: [
        { task_id: 'task-0', comment_count: 3 },
        { task_id: 'task-2', comment_count: 1 },
      ],
      error: null,
    });

    const result = await fetchTaskCommentCounts('ws-1', taskIds);

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('task_comment_counts_batch', {
      p_workspace_id: 'ws-1',
      p_task_ids: taskIds,
    });
    expect(result).toEqual({
      data: {
        'task-0': 3,
        'task-1': 0,
        'task-2': 1,
      },
    });
  });

  it('returns error when RPC call fails', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'rpc failed' },
    });

    const result = await fetchTaskCommentCounts('ws-1', ['task-0']);

    expect(result).toEqual({ error: 'rpc failed' });
  });

  it('loads comments through the explicit author profile foreign key relation', async () => {
    const taskCommentSelectCalls: string[] = [];
    const profileSelectCalls: string[] = [];
    const queriedProfileIds: string[][] = [];

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'task_comments') {
        return {
          select: (query: string) => {
            taskCommentSelectCalls.push(query);
            return {
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({
                        data: [
                          {
                            id: 'comment-1',
                            task_id: 'task-1',
                            author_id: 'user-1',
                            author_display_name_snapshot: 'Snapshot User',
                            content: '<p>Hello</p>',
                            mentioned_user_ids: ['user-2'],
                            created_at: '2026-03-14T10:00:00.000Z',
                            updated_at: '2026-03-14T10:00:00.000Z',
                            deleted_at: null,
                          },
                          {
                            id: 'comment-2',
                            task_id: 'task-1',
                            author_id: 'user-2',
                            author_display_name_snapshot: 'Missing Profile User',
                            content: '<p>Fallback</p>',
                            mentioned_user_ids: [],
                            created_at: '2026-03-14T10:01:00.000Z',
                            updated_at: '2026-03-14T10:01:00.000Z',
                            deleted_at: null,
                          },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          },
        };
      }

      if (table === 'profiles') {
        return {
          select: (query: string) => {
            profileSelectCalls.push(query);
            return {
              in: (_field: string, ids: string[]) => {
                queriedProfileIds.push(ids);
                return Promise.resolve({
                  data: [{ id: 'user-1', display_name: 'Live User', status: 'ACTIVE' }],
                  error: null,
                });
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await fetchTaskComments('ws-1', 'task-1');

    expect(taskCommentSelectCalls).toHaveLength(1);
    expect(taskCommentSelectCalls[0]).not.toContain('profiles');
    expect(profileSelectCalls).toEqual(['id, display_name, status']);
    expect(queriedProfileIds).toEqual([['user-1', 'user-2']]);
    expect(result).toEqual({
      data: {
        comments: [
          {
            id: 'comment-1',
            taskId: 'task-1',
            authorId: 'user-1',
            authorDisplayName: 'Live User',
            authorStatus: 'ACTIVE',
            content: '<p>Hello</p>',
            mentionedUserIds: ['user-2'],
            createdAt: '2026-03-14T10:00:00.000Z',
            updatedAt: '2026-03-14T10:00:00.000Z',
            isEdited: false,
          },
          {
            id: 'comment-2',
            taskId: 'task-1',
            authorId: 'user-2',
            authorDisplayName: 'Missing Profile User',
            authorStatus: 'ACTIVE',
            content: '<p>Fallback</p>',
            mentionedUserIds: [],
            createdAt: '2026-03-14T10:01:00.000Z',
            updatedAt: '2026-03-14T10:01:00.000Z',
            isEdited: false,
          },
        ],
        nextCursor: null,
      },
    });
  });
});
