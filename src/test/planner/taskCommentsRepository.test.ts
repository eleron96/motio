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

import { deleteTaskComment, fetchTaskCommentCounts } from '@/infrastructure/tasks/taskCommentsRepository';
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
});
