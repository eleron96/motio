import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * saveTaskDescription: the card's description is written only over the text
 * the person started from, and pictures are cleaned up against that base —
 * never against a teammate's text.
 */

const supabaseState = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: unknown }>,
  calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  cleanupCandidates: [] as string[][],
}));

vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  filterOrphanTaskMediaIds: async (_workspaceId: string, ids: string[]) => {
    supabaseState.cleanupCandidates.push(ids);
    return [];
  },
  deleteTaskMediaBatch: async () => {},
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

    update(payload: unknown) { return this.record('update', [payload]); }
    select(columns?: unknown) { return this.record('select', [columns]); }
    delete() { return this.record('delete', []); }
    insert(payload: unknown) { return this.record('insert', [payload]); }
    eq(column: string, value: unknown) { return this.record('eq', [column, value]); }
    is(column: string, value: unknown) { return this.record('is', [column, value]); }
    in(column: string, values: unknown) { return this.record('in', [column, values]); }
    gte(column: string, value: unknown) { return this.record('gte', [column, value]); }

    single() {
      this.record('single', []);
      return this.resolve();
    }

    maybeSingle() {
      this.record('maybeSingle', []);
      return this.resolve();
    }

    private resolve() {
      return Promise.resolve(
        supabaseState.queue.shift() ?? { data: null, error: { message: 'no mock response queued' } },
      );
    }

    then(
      onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return this.resolve().then(onFulfilled, onRejected);
    }
  }

  return {
    supabase: {
      from: (table: string) => new MockQueryBuilder(table),
      rpc: (fn: string, args: Record<string, unknown>) => {
        supabaseState.rpcCalls.push({ fn, args });
        return Promise.resolve(
          supabaseState.queue.shift() ?? { data: null, error: { message: 'no mock response queued' } },
        );
      },
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
      },
    },
    getSupabase: () => { throw new Error('not used in tests'); },
  };
});

import { createHash } from 'node:crypto';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { Task } from '@/features/planner/types/planner';

const WS = 'ws-1';
const MEDIA_MINE = '11111111-aaaa-4aaa-8aaa-000000000001';
const MEDIA_TEAMMATE = '11111111-aaaa-4aaa-8aaa-000000000002';
const img = (id: string) => `<img src="https://app.example/functions/v1/task-media/${id}?token=t">`;

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Prepare the offer',
  projectId: null,
  assigneeIds: [],
  startDate: '2026-11-02',
  endDate: '2026-11-03',
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  ...overrides,
});

const taskRow = (description: string | null) => ({
  id: 'task-1',
  workspace_id: WS,
  title: 'Prepare the offer',
  project_id: null,
  assignee_id: null,
  assignee_ids: [],
  start_date: '2026-11-02',
  end_date: '2026-11-03',
  status_id: 'status-1',
  type_id: 'type-1',
  priority: null,
  tag_ids: [],
  description,
  repeat_id: null,
  repeat_ends: null,
  created_at: '2026-10-01T00:00:00+00:00',
  updated_at: '2026-10-30T08:00:00+00:00',
});

const BASE = `<p>Base</p>${img(MEDIA_MINE)}`;

beforeEach(() => {
  supabaseState.queue.length = 0;
  supabaseState.calls.length = 0;
  supabaseState.rpcCalls.length = 0;
  supabaseState.cleanupCandidates.length = 0;
  usePlannerStore.setState({ workspaceId: WS, tasks: [task({ description: BASE })] });
});

describe('saveTaskDescription', () => {
  it('writes over the base it started from and cleans up the pictures it removed', async () => {
    supabaseState.queue.push({ data: [taskRow('<p>Mine</p>')], error: null });

    const result = await usePlannerStore.getState().saveTaskDescription('task-1', '<p>Mine</p>', BASE);

    expect(result).toBe('saved');
    expect(supabaseState.rpcCalls[0]).toEqual({
      fn: 'update_task_description_if_unchanged',
      args: {
        target_task_id: 'task-1',
        expected_description_sha256: createHash('sha256').update(BASE, 'utf8').digest('hex'),
        new_description: '<p>Mine</p>',
      },
    });
    expect(usePlannerStore.getState().tasks[0].description).toBe('<p>Mine</p>');
    expect(supabaseState.cleanupCandidates).toEqual([[MEDIA_MINE]]);
  });

  it('reports a conflict, writes nothing and brings the teammate version in', async () => {
    const theirs = `<p>Theirs</p>${img(MEDIA_TEAMMATE)}`;
    supabaseState.queue.push({ data: [], error: null });
    supabaseState.queue.push({ data: taskRow(theirs), error: null });

    const result = await usePlannerStore.getState().saveTaskDescription('task-1', '<p>Mine</p>', BASE);

    expect(result).toBe('conflict');
    expect(usePlannerStore.getState().tasks[0].description).toBe(theirs);
    expect(supabaseState.cleanupCandidates).toEqual([]);
  });

  it('a lost row is a failure, not a teammate change: deleted task or editing rights gone', async () => {
    supabaseState.queue.push({ data: [], error: null });
    // The row is still there with our base: nobody changed it, the write was refused.
    supabaseState.queue.push({ data: taskRow(BASE), error: null });

    expect(await usePlannerStore.getState().saveTaskDescription('task-1', '<p>Mine</p>', BASE)).toBe('failed');

    supabaseState.queue.push({ data: [], error: null });
    supabaseState.queue.push({ data: null, error: null });
    expect(await usePlannerStore.getState().saveTaskDescription('task-1', '<p>Mine</p>', BASE)).toBe('failed');

    supabaseState.queue.push({ data: [], error: null });
    expect(await usePlannerStore.getState()
      .saveTaskDescription('task-1', '<p>Mine</p>', BASE, { force: true })).toBe('failed');
  });

  it('keeping mine never puts the teammate pictures up for deletion', async () => {
    const theirs = `<p>Theirs</p>${img(MEDIA_TEAMMATE)}`;
    usePlannerStore.setState({ tasks: [task({ description: theirs })] });
    supabaseState.queue.push({ data: [taskRow('<p>Mine</p>')], error: null });

    const result = await usePlannerStore.getState()
      .saveTaskDescription('task-1', '<p>Mine</p>', BASE, { force: true });

    expect(result).toBe('saved');
    // Only the picture of the text we edited; the teammate's one is left alone.
    expect(supabaseState.cleanupCandidates).toEqual([[MEDIA_MINE]]);
  });
});
