import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  ops: [] as Array<[string, unknown[]]>,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/shared/lib/supabaseClient', () => {
  const builder = () => {
    const query = {
      select: (...args: unknown[]) => { state.ops.push(['select', args]); return query; },
      eq: (...args: unknown[]) => { state.ops.push(['eq', args]); return query; },
      is: (...args: unknown[]) => { state.ops.push(['is', args]); return query; },
      in: () => query,
      order: (...args: unknown[]) => { state.ops.push(['order', args]); return query; },
      limit: (...args: unknown[]) => { state.ops.push(['limit', args]); return query; },
      lt: (...args: unknown[]) => { state.ops.push(['lt', args]); return query; },
      then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: state.rows, error: null }),
    };
    return query;
  };
  return { supabase: { from: (table: string) => (table === 'profiles'
    ? { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }
    : builder()) } };
});

import { fetchTaskComments } from '@/infrastructure/tasks/taskCommentsRepository';

const row = (n: number) => ({
  id: `c${n}`,
  task_id: 'task-1',
  author_id: 'u1',
  author_display_name_snapshot: 'Anna',
  content: `<p>${n}</p>`,
  mentioned_user_ids: [],
  created_at: `2026-10-30T10:${String(n).padStart(2, '0')}:00.000Z`,
  updated_at: `2026-10-30T10:${String(n).padStart(2, '0')}:00.000Z`,
  deleted_at: null,
});

beforeEach(() => {
  state.ops.length = 0;
});

describe('fetchTaskComments paging', () => {
  it('opens on the newest comments, shown oldest first, with a cursor to older ones', async () => {
    // 21 rows newest first: comments 30 down to 10 of a long discussion.
    state.rows = Array.from({ length: 21 }, (_, index) => row(30 - index));

    const result = await fetchTaskComments('ws-1', 'task-1', null, 20);

    expect(state.ops).toContainEqual(['order', ['created_at', { ascending: false }]]);
    if ('error' in result) throw new Error(result.error);
    const ids = result.data.comments.map((comment) => comment.id);
    expect(ids[0]).toBe('c11');
    expect(ids.at(-1)).toBe('c30');
    expect(ids).toHaveLength(20);
    expect(result.data.nextCursor).toBe(row(11).created_at);
  });

  it('loads the page just older than the cursor, and says when there is no more', async () => {
    state.rows = [row(10), row(9)];

    const result = await fetchTaskComments('ws-1', 'task-1', row(11).created_at, 20);

    expect(state.ops).toContainEqual(['lt', ['created_at', row(11).created_at]]);
    if ('error' in result) throw new Error(result.error);
    expect(result.data.comments.map((comment) => comment.id)).toEqual(['c9', 'c10']);
    expect(result.data.nextCursor).toBeNull();
  });
});
