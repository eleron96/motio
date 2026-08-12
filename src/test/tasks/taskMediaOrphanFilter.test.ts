import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * filterOrphanTaskMediaIds is the DB-side authority for media GC: a blob may
 * only be deleted when NO live task of the workspace references it — including
 * tasks far outside the client's loaded timeline range.
 */

const supabaseState = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: unknown }>,
  calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
}));

vi.mock('@/shared/lib/supabaseClient', () => {
  class MockQueryBuilder {
    ops: Array<[string, unknown[]]> = [];

    constructor(table: string) {
      supabaseState.calls.push({ table, ops: this.ops });
    }

    private record(op: string, args: unknown[]) {
      this.ops.push([op, args]);
      return this;
    }

    select(columns?: unknown) { return this.record('select', [columns]); }
    eq(column: string, value: unknown) { return this.record('eq', [column, value]); }
    like(column: string, pattern: unknown) { return this.record('like', [column, pattern]); }
    limit(count: number) { return this.record('limit', [count]); }

    then(
      onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        supabaseState.queue.shift() ?? { data: null, error: { message: 'no mock response queued' } },
      ).then(onFulfilled, onRejected);
    }
  }

  return {
    supabase: { from: (table: string) => new MockQueryBuilder(table) },
    getSupabase: () => { throw new Error('not used in tests'); },
  };
});

import { filterOrphanTaskMediaIds } from '@/infrastructure/tasks/taskMediaRepository';

const WS = 'ws-1';
const ref = (mediaId: string) => `<img src="https://x/functions/v1/task-media/${mediaId}?token=t">`;

beforeEach(() => {
  supabaseState.queue.length = 0;
  supabaseState.calls.length = 0;
});

describe('filterOrphanTaskMediaIds', () => {
  it('keeps a blob that another (unloaded) task still references', async () => {
    supabaseState.queue.push({ data: [{ description: ref('media-a') }], error: null });

    const orphans = await filterOrphanTaskMediaIds(WS, ['media-a']);
    expect(orphans).toEqual([]);

    const call = supabaseState.calls[0];
    expect(call.ops).toEqual(expect.arrayContaining([
      ['eq', ['workspace_id', WS]],
      ['like', ['description', '%/task-media/media-a%']],
    ]));
  });

  it('reports a blob orphaned when no task in the DB references it', async () => {
    supabaseState.queue.push({ data: [], error: null });

    const orphans = await filterOrphanTaskMediaIds(WS, ['media-b']);
    expect(orphans).toEqual(['media-b']);
  });

  it('re-parses LIKE hits strictly: a longer-id substring match does not count as a reference', async () => {
    // LIKE '%/task-media/media-c%' зацепил ссылку на ДРУГОЙ id с тем же префиксом.
    supabaseState.queue.push({ data: [{ description: ref('media-c-other') }], error: null });

    const orphans = await filterOrphanTaskMediaIds(WS, ['media-c']);
    expect(orphans).toEqual(['media-c']);
  });

  it('fails closed: a query error keeps the blob', async () => {
    supabaseState.queue.push({ data: null, error: { message: 'boom' } });

    const orphans = await filterOrphanTaskMediaIds(WS, ['media-d']);
    expect(orphans).toEqual([]);
  });

  it('skips querying entirely for empty input or blank workspace', async () => {
    expect(await filterOrphanTaskMediaIds(WS, [])).toEqual([]);
    expect(await filterOrphanTaskMediaIds('  ', ['media-e'])).toEqual([]);
    expect(supabaseState.calls).toHaveLength(0);
  });
});
