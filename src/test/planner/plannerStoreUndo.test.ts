import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Store-level tests for the undo slice: capture on detach-move, conditional
 * inverse updates, and the deferred-delete lifecycle (hide -> undo-with-refetch
 * / commit-after-window), including the pendingDeleteTaskIds resurrection
 * guard in upsertTasks.
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
import type { Task } from '@/features/planner/types/planner';

const WS = 'ws-1';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Undo target',
  projectId: null,
  assigneeIds: ['person-1'],
  startDate: '2026-08-03',
  endDate: '2026-08-04',
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  ...overrides,
});

const taskRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  workspace_id: WS,
  title: 'Undo target',
  project_id: null,
  assignee_id: 'person-1',
  assignee_ids: ['person-1'],
  start_date: '2026-08-03',
  end_date: '2026-08-04',
  status_id: 'status-1',
  type_id: 'type-1',
  priority: null,
  tag_ids: [],
  description: null,
  repeat_id: null,
  repeat_ends: null,
  created_at: '2026-08-01T00:00:00+00:00',
  updated_at: '2026-08-01T00:00:00+00:00',
  ...overrides,
});

const flattenOps = (call: { ops: Array<[string, unknown[]]> }) => call.ops.map(([op]) => op);

beforeEach(() => {
  supabaseState.queue.length = 0;
  supabaseState.calls.length = 0;
  usePlannerStore.setState({
    workspaceId: WS,
    tasks: [],
    taskUndoStack: [],
    pendingDeleteTaskIds: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('moveTaskDetached', () => {
  it('writes repeat_id=null with the move and records a detach-move entry that restores the series link', async () => {
    usePlannerStore.setState({ tasks: [task({ repeatId: 'series-9' })] });

    // updateTask single: .update().eq().eq().select().single()
    supabaseState.queue.push({
      data: taskRow({ start_date: '2026-08-05', end_date: '2026-08-06', repeat_id: null }),
      error: null,
    });

    await usePlannerStore.getState().moveTaskDetached('task-1', '2026-08-05', '2026-08-06');

    const updateCall = supabaseState.calls.find((call) => flattenOps(call).includes('update'));
    expect(updateCall).toBeTruthy();
    // Открепление и перенос уходят одним UPDATE с repeat_id: null.
    expect(updateCall!.ops.find(([op]) => op === 'update')![1][0]).toMatchObject({
      repeat_id: null,
      start_date: '2026-08-05',
      end_date: '2026-08-06',
    });

    const stack = usePlannerStore.getState().taskUndoStack;
    expect(stack).toHaveLength(1);
    expect(stack[0].kind).toBe('detach-move');
    expect(stack[0].rows[0].restore).toEqual({
      start_date: '2026-08-03',
      end_date: '2026-08-04',
      repeat_id: 'series-9',
    });
    expect(stack[0].rows[0].expect.repeat_id).toBeNull();
  });
});

describe('undoTaskEntry (conditional update)', () => {
  it('restores dates and reports stale when the guard matches zero rows', async () => {
    usePlannerStore.setState({
      tasks: [task({ startDate: '2026-08-05', endDate: '2026-08-06' })],
      taskUndoStack: [{
        id: 'entry-1',
        workspaceId: WS,
        kind: 'move',
        rows: [{
          taskId: 'task-1',
          restore: { start_date: '2026-08-03', end_date: '2026-08-04' },
          expect: { start_date: '2026-08-05', end_date: '2026-08-06' },
        }],
      }],
    });

    // Гард не совпал: PostgREST вернул пустой список строк.
    supabaseState.queue.push({ data: [], error: null });

    const outcome = await usePlannerStore.getState().undoTaskEntry('entry-1');
    expect(outcome).toEqual({ restored: 0, stale: 1, failed: 0, total: 1 });
    // Запись снята со стека и не возвращается (stale — не сетевой сбой).
    expect(usePlannerStore.getState().taskUndoStack).toHaveLength(0);
  });

  it('re-pushes only network-failed rows so retry targets the remainder', async () => {
    usePlannerStore.setState({
      taskUndoStack: [{
        id: 'entry-1',
        workspaceId: WS,
        kind: 'series-move',
        rows: [
          {
            taskId: 'task-1',
            restore: { start_date: '2026-08-01', end_date: '2026-08-01' },
            expect: { start_date: '2026-08-03', end_date: '2026-08-03' },
          },
          {
            taskId: 'task-2',
            restore: { start_date: '2026-08-08', end_date: '2026-08-08' },
            expect: { start_date: '2026-08-10', end_date: '2026-08-10' },
          },
        ],
      }],
    });

    supabaseState.queue.push({ data: [taskRow()], error: null }); // task-1 restored
    supabaseState.queue.push({ data: null, error: { message: 'network down' } }); // task-2 failed

    const outcome = await usePlannerStore.getState().undoTaskEntry('entry-1');
    expect(outcome).toEqual({ restored: 1, stale: 0, failed: 1, total: 2 });

    const stack = usePlannerStore.getState().taskUndoStack;
    expect(stack).toHaveLength(1);
    expect(stack[0].id).toBe('entry-1');
    expect(stack[0].rows).toHaveLength(1);
    expect(stack[0].rows[0].taskId).toBe('task-2');
  });
});

describe('deleteTaskDeferred', () => {
  it('hides the task, blocks live-sync resurrection, and undo restores the FRESH row from the DB', async () => {
    vi.useFakeTimers();
    usePlannerStore.setState({ tasks: [task()] });

    await usePlannerStore.getState().deleteTaskDeferred('task-1');

    const state = usePlannerStore.getState();
    expect(state.tasks).toHaveLength(0);
    expect(state.pendingDeleteTaskIds).toEqual(['task-1']);
    expect(state.taskUndoStack[0]?.kind).toBe('delete');

    // Пока окно открыто, CDC-upsert не воскрешает задачу.
    usePlannerStore.getState().upsertTasks([task({ title: 'zombie from CDC' })]);
    expect(usePlannerStore.getState().tasks).toHaveLength(0);

    // Отмена: рефетч из БД возвращает строку, изменённую коллегой в окне —
    // восстановиться должна именно она, а не устаревший снапшот.
    supabaseState.queue.push({
      data: [taskRow({ title: 'edited by teammate' })],
      error: null,
    });
    const outcome = await usePlannerStore.getState().undoTaskEntry(
      usePlannerStore.getState().taskUndoStack[0].id,
    );

    expect(outcome).toEqual({ restored: 1, stale: 0, failed: 0, total: 1 });
    const after = usePlannerStore.getState();
    expect(after.pendingDeleteTaskIds).toEqual([]);
    expect(after.tasks).toHaveLength(1);
    expect(after.tasks[0].title).toBe('edited by teammate');

    // Окно закрыто отменой: таймер погашен, DELETE не уходит.
    await vi.advanceTimersByTimeAsync(8000);
    const deleteCalls = supabaseState.calls.filter((call) => flattenOps(call).includes('delete'));
    expect(deleteCalls).toHaveLength(0);
  });

  it('reports stale instead of resurrecting when the row is already gone from the DB', async () => {
    vi.useFakeTimers();
    usePlannerStore.setState({ tasks: [task()] });
    await usePlannerStore.getState().deleteTaskDeferred('task-1');

    supabaseState.queue.push({ data: [], error: null }); // рефетч: строки нет

    const outcome = await usePlannerStore.getState().undoTaskEntry(
      usePlannerStore.getState().taskUndoStack[0].id,
    );
    expect(outcome).toEqual({ restored: 0, stale: 1, failed: 0, total: 1 });
    expect(usePlannerStore.getState().tasks).toHaveLength(0);
    expect(usePlannerStore.getState().pendingDeleteTaskIds).toEqual([]);
  });

  it('commits after the window: entry leaves the stack, DELETE fires, block list clears', async () => {
    vi.useFakeTimers();
    usePlannerStore.setState({ tasks: [task()] });
    await usePlannerStore.getState().deleteTaskDeferred('task-1');

    supabaseState.queue.push({ data: [taskRow()], error: null }); // select описаний для media GC
    supabaseState.queue.push({ data: null, error: null }); // DELETE

    await vi.advanceTimersByTimeAsync(7100);

    const state = usePlannerStore.getState();
    expect(state.taskUndoStack).toHaveLength(0);
    expect(state.pendingDeleteTaskIds).toEqual([]);
    const deleteCall = supabaseState.calls.find((call) => flattenOps(call).includes('delete'));
    expect(deleteCall).toBeTruthy();
    expect(deleteCall!.ops).toEqual(expect.arrayContaining([
      ['eq', ['workspace_id', WS]],
      ['in', ['id', ['task-1']]],
    ]));
  });
});

describe('pushTaskUndo workspace guard', () => {
  it('ignores entries finishing after a workspace switch instead of wiping the new stack', () => {
    usePlannerStore.setState({
      taskUndoStack: [{
        id: 'fresh-entry', workspaceId: WS, kind: 'move',
        rows: [{ taskId: 't-new', restore: {}, expect: {} }],
      }],
    });

    usePlannerStore.getState().pushTaskUndo({
      id: 'foreign-entry',
      workspaceId: 'ws-OTHER',
      kind: 'series-move',
      rows: [{ taskId: 't-old', restore: {}, expect: {} }],
    });

    const stack = usePlannerStore.getState().taskUndoStack;
    expect(stack.map((entry) => entry.id)).toEqual(['fresh-entry']);
  });
});
