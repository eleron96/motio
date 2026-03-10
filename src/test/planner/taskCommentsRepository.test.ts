import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    rpc: supabaseMocks.rpc,
  },
}));

import { deleteTaskComment } from '@/infrastructure/tasks/taskCommentsRepository';

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
});
