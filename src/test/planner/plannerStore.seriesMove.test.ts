import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Moving a repeat series: the occurrences on screen move at once, the whole
 * series goes to the database in one shift_repeat_series call (0164), and a
 * failure shows the series as it is in the database again.
 */

type Answer = { data: unknown; error: unknown };

const supabaseState = vi.hoisted(() => ({
  seriesRows: [] as unknown[],
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown>; resolve: (answer: Answer) => void }>,
  updateCalls: 0,
}));

vi.mock('@/shared/lib/supabaseClient', () => {
  class MockQueryBuilder {
    select() { return this; }
    eq() { return this; }
    gte() { return this; }
    update() { supabaseState.updateCalls += 1; return this; }
    then(onFulfilled: (value: Answer) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: supabaseState.seriesRows, error: null }).then(onFulfilled, onRejected);
    }
  }
  return {
    supabase: {
      from: () => new MockQueryBuilder(),
      rpc: (name: string, args: Record<string, unknown>) => new Promise<Answer>((resolve) => {
        supabaseState.rpcCalls.push({ name, args, resolve });
      }),
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  };
});

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { Task } from '@/features/planner/types/planner';

const WS = 'ws-1';
const REPEAT = 'repeat-1';

const occurrence = (index: number): Task => ({
  id: `task-${index}`,
  title: 'Weekly sync',
  projectId: null,
  assigneeIds: [],
  startDate: `2026-08-0${3 + index}`,
  endDate: `2026-08-0${3 + index}`,
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: undefined,
  repeatId: REPEAT,
  updatedAt: '2026-08-01T10:00:00.000Z',
});

const toRow = (task: Task, overrides: Record<string, unknown> = {}) => ({
  id: task.id,
  workspace_id: WS,
  title: task.title,
  project_id: null,
  assignee_id: null,
  assignee_ids: [],
  start_date: task.startDate,
  end_date: task.endDate,
  status_id: task.statusId,
  type_id: task.typeId,
  priority: null,
  tag_ids: [],
  description: null,
  repeat_id: REPEAT,
  repeat_ends: null,
  created_at: '2026-08-01T09:00:00.000Z',
  updated_at: '2026-08-01T10:00:00.000Z',
  ...overrides,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const dates = () => usePlannerStore.getState().tasks.map((task) => task.startDate);

describe('series move', () => {
  beforeEach(() => {
    supabaseState.rpcCalls.length = 0;
    supabaseState.updateCalls = 0;
    usePlannerStore.getState().reset();
    // Two occurrences are loaded; the series in the database has three.
    const loaded = [occurrence(0), occurrence(1)];
    supabaseState.seriesRows = [...loaded, occurrence(2)].map((task) => toRow(task));
    usePlannerStore.setState({ workspaceId: WS, tasks: loaded });
  });

  it('moves the loaded occurrences at once and the whole series in one call', async () => {
    const move = usePlannerStore.getState().moveTask('task-0', '2026-08-05', '2026-08-05', 'all');
    expect(dates()).toEqual(['2026-08-05', '2026-08-06']);
    await flush();

    expect(supabaseState.updateCalls).toBe(0);
    expect(supabaseState.rpcCalls).toHaveLength(1);
    const call = supabaseState.rpcCalls[0];
    expect(call.name).toBe('shift_repeat_series');
    expect(call.args).toMatchObject({ p_workspace_id: WS, p_repeat_id: REPEAT });
    expect(call.args.p_rows).toEqual([
      { id: 'task-0', start_date: '2026-08-05', end_date: '2026-08-05' },
      { id: 'task-1', start_date: '2026-08-06', end_date: '2026-08-06' },
      { id: 'task-2', start_date: '2026-08-07', end_date: '2026-08-07' },
    ]);

    call.resolve({
      data: (call.args.p_rows as Array<{ id: string; start_date: string; end_date: string }>).map((item, index) => (
        toRow(occurrence(index), { ...item, updated_at: '2026-08-01T10:05:00.000Z' })
      )),
      error: null,
    });
    await move;

    expect(dates()).toEqual(['2026-08-05', '2026-08-06']);
    const undo = usePlannerStore.getState().taskUndoStack;
    expect(undo).toHaveLength(1);
    expect(undo[0]).toMatchObject({ kind: 'series-move' });
    expect(undo[0].rows).toHaveLength(3);
  });

  it('puts the series back and reports when the call fails', async () => {
    const move = usePlannerStore.getState().moveTask('task-0', '2026-08-05', '2026-08-05', 'all');
    await flush();
    supabaseState.rpcCalls[0].resolve({ data: null, error: { message: 'offline' } });
    await move;

    expect(dates()).toEqual(['2026-08-03', '2026-08-04']);
    expect(usePlannerStore.getState().taskWriteFailure).toMatchObject({ kind: 'save' });
    expect(usePlannerStore.getState().taskUndoStack).toHaveLength(0);
  });
});
