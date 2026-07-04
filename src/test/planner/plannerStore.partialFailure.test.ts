import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskActions } from '@/features/planner/store/plannerStore.taskActions';
import { mapTaskRow } from '@/shared/domain/taskRowMapper';
import type { TaskRow } from '@/features/planner/store/plannerStore.helpers';

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: supabaseMocks.from,
    rpc: supabaseMocks.rpc,
  },
}));

const makeRow = (overrides: Partial<TaskRow>): TaskRow => ({
  id: 'task-1',
  workspace_id: 'workspace-1',
  title: 'Repeat task',
  project_id: 'project-1',
  assignee_id: null,
  assignee_ids: [],
  start_date: '2026-02-01',
  end_date: '2026-02-01',
  status_id: 'status-1',
  type_id: 'type-1',
  priority: null,
  tag_ids: [],
  description: null,
  repeat_id: 'repeat-1',
  ...overrides,
});

/**
 * In-memory tasks-table mock. Mutates `rows` in place on update/delete so a
 * later refetch (the resync path under test) observes the partially-committed
 * state. `failUpdateForId` forces the update of that single row to fail WITHOUT
 * mutating it — simulating a mid-loop DB error after earlier rows succeeded.
 */
const makeTasksQueryBuilder = (rows: TaskRow[], opts: { failUpdateForId?: string } = {}) => {
  const filters: Array<(row: TaskRow) => boolean> = [];
  let updatePayload: Partial<TaskRow> | null = null;
  let deleteMode = false;

  const applyFilters = () => rows.filter((row) => filters.every((filter) => filter(row)));
  const cloneRows = (items: TaskRow[]) => items.map((item) => ({ ...item }));

  const resolveList = async (): Promise<{ data: TaskRow[]; error: { message: string } | null; failed?: boolean }> => {
    const matches = applyFilters();

    if (updatePayload) {
      const failing = opts.failUpdateForId
        ? matches.find((row) => row.id === opts.failUpdateForId)
        : undefined;
      const toUpdate = failing ? matches.filter((row) => row.id !== failing.id) : matches;
      toUpdate.forEach((row) => Object.assign(row, updatePayload));
      if (failing) {
        return { data: cloneRows(toUpdate), error: { message: 'Forced update failure' }, failed: true };
      }
      return { data: cloneRows(matches), error: null };
    }

    if (deleteMode) {
      const matchedIds = new Set(matches.map((row) => row.id));
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matchedIds.has(rows[index].id)) {
          rows.splice(index, 1);
        }
      }
      return { data: [], error: null };
    }

    return { data: cloneRows(matches), error: null };
  };

  const builder = {
    select: vi.fn(() => builder),
    update: vi.fn((payload: Partial<TaskRow>) => {
      updatePayload = payload;
      return builder;
    }),
    delete: vi.fn(() => {
      deleteMode = true;
      return builder;
    }),
    insert: vi.fn(() => {
      throw new Error('insert should not be used in this test');
    }),
    eq: vi.fn((field: keyof TaskRow, value: unknown) => {
      filters.push((row) => row[field] === value);
      return builder;
    }),
    in: vi.fn((field: keyof TaskRow, values: unknown[]) => {
      filters.push((row) => values.includes(row[field]));
      return builder;
    }),
    gte: vi.fn((field: keyof TaskRow, value: unknown) => {
      filters.push((row) => String(row[field]) >= String(value));
      return builder;
    }),
    single: vi.fn(async () => {
      const result = await resolveList();
      if (result.failed) {
        return { data: null, error: { message: 'Forced update failure' } };
      }
      const first = result.data[0] ?? null;
      return { data: first, error: first ? null : { message: 'Not found.' } };
    }),
    then: (resolve: (value: { data: TaskRow[]; error: unknown }) => void, reject?: (reason?: unknown) => void) => (
      resolveList().then((result) => resolve({ data: result.data, error: result.error }), reject)
    ),
  };

  return builder;
};

const makeHarness = (dbRows: TaskRow[]) => {
  let state = {
    workspaceId: 'workspace-1',
    tasks: dbRows.map(mapTaskRow),
    selectedTaskId: null as string | null,
    assignees: [] as Array<{ id: string; isActive: boolean }>,
    removeTasksByIds: (ids: string[]) => {
      state = { ...state, tasks: state.tasks.filter((task) => !ids.includes(task.id)) };
    },
  };
  const set = (partial: Record<string, unknown> | ((current: typeof state) => Record<string, unknown>)) => {
    const nextPartial = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...nextPartial };
  };
  const get = () => state;
  return { get, set, getState: () => state };
};

describe('plannerStore partial-failure resync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateRepeatSeries: leaves the series untouched when the atomic rebuild fails', async () => {
    const dbRows: TaskRow[] = [
      makeRow({ id: 'task-1', start_date: '2026-02-01', end_date: '2026-02-01' }),
      makeRow({ id: 'task-2', start_date: '2026-02-08', end_date: '2026-02-08' }),
      makeRow({ id: 'task-3', start_date: '2026-02-15', end_date: '2026-02-15' }),
    ];

    // The rebuild now runs as one atomic RPC. Simulate that transaction failing:
    // the RPC rejects and — crucially — mutates NOTHING, so `from('tasks')` (the
    // series read + the resync) keeps observing the original, untouched rows.
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table !== 'tasks') throw new Error(`Unexpected table ${table}`);
      return makeTasksQueryBuilder(dbRows);
    });
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { message: 'Forced rebuild failure' } });

    const harness = makeHarness(dbRows);
    const actions = createTaskActions(harness.set as never, harness.get as never);

    const result = await actions.updateRepeatSeries('task-1', {
      frequency: 'biweekly',
      ends: 'after',
      count: 3,
    }, 'all');

    expect(result.error).toBe('Forced rebuild failure');

    const state = harness.getState();
    // Atomicity: NOTHING moved — every row keeps its original date in both the DB
    // and the store (no half-rebuilt series). This is the whole point of the fix.
    expect(dbRows.find((row) => row.id === 'task-2')?.start_date).toBe('2026-02-08');
    expect(dbRows.find((row) => row.id === 'task-3')?.start_date).toBe('2026-02-15');
    expect(state.tasks.find((task) => task.id === 'task-1')?.startDate).toBe('2026-02-01');
    expect(state.tasks.find((task) => task.id === 'task-2')?.startDate).toBe('2026-02-08');
    expect(state.tasks.find((task) => task.id === 'task-3')?.startDate).toBe('2026-02-15');
  });

  it('removeAssigneeFromTask: resyncs the store from the DB when a later row update fails', async () => {
    const dbRows: TaskRow[] = [
      makeRow({ id: 'task-1', assignee_id: 'u1', assignee_ids: ['u1', 'u2'], start_date: '2026-02-01' }),
      makeRow({ id: 'task-2', assignee_id: 'u1', assignee_ids: ['u1', 'u2'], start_date: '2026-02-08' }),
    ];

    // Following-mode removal walks both rows; force the SECOND (task-2) to fail.
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table !== 'tasks') throw new Error(`Unexpected table ${table}`);
      return makeTasksQueryBuilder(dbRows, { failUpdateForId: 'task-2' });
    });

    const harness = makeHarness(dbRows);
    const actions = createTaskActions(harness.set as never, harness.get as never);

    await actions.removeAssigneeFromTask('task-1', 'u1', 'following');

    const state = harness.getState();
    // task-1's successful removal is reflected in the store (resync).
    expect(state.tasks.find((task) => task.id === 'task-1')?.assigneeIds).toEqual(['u2']);
    // task-2's update failed, so it keeps both assignees in DB and store.
    expect(state.tasks.find((task) => task.id === 'task-2')?.assigneeIds).toEqual(['u1', 'u2']);
    expect(dbRows.find((row) => row.id === 'task-1')?.assignee_ids).toEqual(['u2']);
  });
});
