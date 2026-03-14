import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  taskCommentCountBatchIds: [] as string[][],
  queuedTaskCommentCountResults: [] as Array<{
    data: Array<{ task_id: string | null }>;
    error: { message: string } | null;
  }>,
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
import { TASK_COMMENT_QUERY_BATCH_SIZE } from '@/shared/domain/taskCommentCount';

describe('taskCommentsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.taskCommentCountBatchIds = [];
    supabaseMocks.queuedTaskCommentCountResults = [];
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table !== 'task_comments') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: () => ({
          eq: () => ({
            in: (_field: string, ids: string[]) => {
              supabaseMocks.taskCommentCountBatchIds.push(ids);
              return {
                is: () => Promise.resolve(
                  supabaseMocks.queuedTaskCommentCountResults.shift() ?? { data: [], error: null },
                ),
              };
            },
          }),
        }),
      };
    });
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

  it('batches large task comment count requests to avoid oversized URLs', async () => {
    const taskIds = Array.from(
      { length: TASK_COMMENT_QUERY_BATCH_SIZE + 1 },
      (_, index) => `task-${index}`,
    );

    supabaseMocks.queuedTaskCommentCountResults.push(
      { data: [{ task_id: 'task-0' }], error: null },
      { data: [{ task_id: `task-${TASK_COMMENT_QUERY_BATCH_SIZE}` }], error: null },
    );

    const result = await fetchTaskCommentCounts('ws-1', taskIds);

    expect(supabaseMocks.taskCommentCountBatchIds).toHaveLength(2);
    expect(supabaseMocks.taskCommentCountBatchIds[0]).toHaveLength(TASK_COMMENT_QUERY_BATCH_SIZE);
    expect(supabaseMocks.taskCommentCountBatchIds[1]).toEqual([`task-${TASK_COMMENT_QUERY_BATCH_SIZE}`]);
    expect(result).toEqual({
      data: {
        ...Object.fromEntries(taskIds.map((taskId) => [taskId, 0])),
        'task-0': 1,
        [`task-${TASK_COMMENT_QUERY_BATCH_SIZE}`]: 1,
      },
    });
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
                  data: [{ id: 'user-1', display_name: 'Live User' }],
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
    expect(profileSelectCalls).toEqual(['id, display_name']);
    expect(queriedProfileIds).toEqual([['user-1', 'user-2']]);
    expect(result).toEqual({
      data: {
        comments: [
          {
            id: 'comment-1',
            taskId: 'task-1',
            authorId: 'user-1',
            authorDisplayName: 'Live User',
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
