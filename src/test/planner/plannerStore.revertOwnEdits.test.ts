import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Discard in the task card: revertTaskOwnEdits writes back only our own
 * edits, conditionally on the task version, and re-decides after a
 * teammate's save instead of overwriting it.
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
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
      },
    },
    getSupabase: () => { throw new Error('not used in tests'); },
  };
});

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { recordTaskOwnEdits } from '@/shared/domain/taskOwnEdits';
import type { Task } from '@/features/planner/types/planner';

const WS = 'ws-1';
const V1 = '2026-10-30T08:00:00.000001+00:00';
const V2 = '2026-10-30T08:00:05.000001+00:00';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Prepare the offer',
  projectId: null,
  assigneeIds: ['person-1'],
  startDate: '2026-11-02',
  endDate: '2026-11-03',
  statusId: 'status-doing',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  updatedAt: V1,
  ...overrides,
});

const taskRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  workspace_id: WS,
  title: 'Prepare the offer',
  project_id: null,
  assignee_id: 'person-1',
  assignee_ids: ['person-1'],
  start_date: '2026-11-02',
  end_date: '2026-11-03',
  status_id: 'status-doing',
  type_id: 'type-1',
  priority: null,
  tag_ids: [],
  description: null,
  repeat_id: null,
  repeat_ends: null,
  created_at: '2026-10-01T00:00:00+00:00',
  updated_at: V1,
  ...overrides,
});

// We moved the task from "To do" to "Doing" in the card.
const ownEdits = recordTaskOwnEdits({}, task({ statusId: 'status-todo' }), { statusId: 'status-doing' });

beforeEach(() => {
  supabaseState.queue.length = 0;
  supabaseState.calls.length = 0;
  usePlannerStore.setState({ workspaceId: WS, tasks: [task({ title: 'Renamed by a teammate' })] });
});

describe('revertTaskOwnEdits', () => {
  it('writes back only our field, conditionally on the task version', async () => {
    supabaseState.queue.push({
      data: [taskRow({ title: 'Renamed by a teammate', status_id: 'status-todo', updated_at: V2 })],
      error: null,
    });

    await usePlannerStore.getState().revertTaskOwnEdits('task-1', ownEdits);

    expect(supabaseState.calls).toHaveLength(1);
    const ops = supabaseState.calls[0].ops;
    expect(ops[0]).toEqual(['update', [{ status_id: 'status-todo' }]]);
    expect(ops).toContainEqual(['eq', ['updated_at', V1]]);
    const stored = usePlannerStore.getState().tasks[0];
    expect(stored.statusId).toBe('status-todo');
    // The teammate's rename survives Discard.
    expect(stored.title).toBe('Renamed by a teammate');
  });

  it('re-reads after a teammate saved in between and keeps their newer value', async () => {
    // Conditional update matched nothing: the version moved on.
    supabaseState.queue.push({ data: [], error: null });
    // Fresh row: the teammate set the status themselves after us.
    supabaseState.queue.push({ data: taskRow({ status_id: 'status-blocked', updated_at: V2 }), error: null });

    await usePlannerStore.getState().revertTaskOwnEdits('task-1', ownEdits);

    // Update, re-read — and no second write over the teammate's status.
    expect(supabaseState.calls.map((call) => call.ops[0][0])).toEqual(['update', 'select']);
    expect(usePlannerStore.getState().tasks[0].statusId).toBe('status-blocked');
  });

  it('writes nothing when there is nothing of ours to roll back', async () => {
    usePlannerStore.setState({ tasks: [task({ statusId: 'status-blocked' })] });

    await usePlannerStore.getState().revertTaskOwnEdits('task-1', ownEdits);

    expect(supabaseState.calls).toHaveLength(0);
  });
});
