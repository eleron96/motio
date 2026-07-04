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

// `from('tasks')` only serves reads here (the series SELECT + the resync path):
// return the current in-memory rows when awaited.
const makeSelectBuilder = (rows: TaskRow[]) => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (resolve: (value: { data: TaskRow[]; error: null }) => void, reject?: (reason?: unknown) => void) => (
      Promise.resolve({ data: rows.map((row) => ({ ...row })), error: null }).then(resolve, reject)
    ),
  };
  return builder;
};

type RebuildArgs = {
  p_anchor_id: string;
  p_updates: Array<{ id: string; start_date: string; end_date: string }>;
  p_delete_ids: string[];
  p_creates: Array<{ start_date: string; end_date: string }>;
  p_ends: string;
};

// Faithful, ATOMIC stand-in for the rebuild_repeat_series RPC: applies the whole
// plan to `rows` in one shot (updates + tail delete + cloned inserts + end-mode
// sweep) and returns the resulting series. Either everything applies or, on the
// error variant, nothing does.
const installRebuildRpc = (rows: TaskRow[]) => {
  supabaseMocks.rpc.mockImplementation(async (name: string, args: RebuildArgs) => {
    if (name !== 'rebuild_repeat_series') throw new Error(`Unexpected rpc ${name}`);
    const anchor = rows.find((row) => row.id === args.p_anchor_id) ?? rows[0];

    args.p_updates.forEach((update) => {
      const row = rows.find((item) => item.id === update.id);
      if (row) {
        row.start_date = update.start_date;
        row.end_date = update.end_date;
      }
    });

    if (args.p_delete_ids.length > 0) {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (args.p_delete_ids.includes(rows[index].id)) rows.splice(index, 1);
      }
    }

    args.p_creates.forEach((occurrence, index) => {
      rows.push({
        ...anchor,
        id: `created-${index + 1}`,
        start_date: occurrence.start_date,
        end_date: occurrence.end_date,
        repeat_ends: args.p_ends, // born with the mode, like the real INSERT
      });
    });

    rows.forEach((row) => { row.repeat_ends = args.p_ends; });

    const series = [...rows].sort((left, right) => (
      left.start_date.localeCompare(right.start_date) || left.id.localeCompare(right.id)
    ));
    return { data: series.map((row) => ({ ...row })), error: null };
  });
};

const makeHarness = (dbRows: TaskRow[]) => {
  let state = {
    workspaceId: 'workspace-1',
    tasks: dbRows.map(mapTaskRow),
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

describe('plannerStore.updateRepeatSeries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rebuilds future dates in place when the cadence changes', async () => {
    const dbRows: TaskRow[] = [
      makeRow({ id: 'task-1', start_date: '2026-02-01', end_date: '2026-02-01' }),
      makeRow({ id: 'task-2', start_date: '2026-02-08', end_date: '2026-02-08' }),
    ];
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table !== 'tasks') throw new Error(`Unexpected table ${table}`);
      return makeSelectBuilder(dbRows);
    });
    installRebuildRpc(dbRows);

    const harness = makeHarness(dbRows);
    const actions = createTaskActions(harness.set as never, harness.get as never);
    const result = await actions.updateRepeatSeries('task-1', {
      frequency: 'biweekly',
      ends: 'after',
      count: 2,
    }, 'following');

    expect(result).toEqual({ updated: 1, deleted: 0, created: 0 });
    expect(dbRows[1].start_date).toBe('2026-02-15');
    expect(dbRows[1].end_date).toBe('2026-02-15');

    const state = harness.getState();
    expect(state.tasks.find((task) => task.id === 'task-2')?.startDate).toBe('2026-02-15');
    // The chosen end mode is persisted across the whole series and reflected in
    // the store so the panel can read it back.
    expect(dbRows.every((row) => row.repeat_ends === 'after')).toBe(true);
    expect(state.tasks.every((task) => task.repeatEnds === 'after')).toBe(true);
  });

  it('stamps the end mode on rows created while extending the series', async () => {
    const dbRows: TaskRow[] = [
      makeRow({ id: 'task-1', start_date: '2026-02-01', end_date: '2026-02-01', repeat_ends: 'after' }),
      makeRow({ id: 'task-2', start_date: '2026-02-08', end_date: '2026-02-08', repeat_ends: 'after' }),
    ];
    supabaseMocks.from.mockImplementation((table: string) => {
      if (table !== 'tasks') throw new Error(`Unexpected table ${table}`);
      return makeSelectBuilder(dbRows);
    });
    installRebuildRpc(dbRows);

    const harness = makeHarness(dbRows);
    const actions = createTaskActions(harness.set as never, harness.get as never);
    const result = await actions.updateRepeatSeries('task-1', {
      frequency: 'weekly',
      ends: 'after',
      count: 4,
    }, 'all');

    expect(result.created).toBe(2);
    // The whole series — original + created — ends up consistent, and the newly
    // created rows carry the mode (stamped by the INSERT inside the RPC).
    expect(dbRows).toHaveLength(4);
    expect(dbRows.every((row) => row.repeat_ends === 'after')).toBe(true);
    expect(dbRows.filter((row) => row.id.startsWith('created-'))).toHaveLength(2);

    const state = harness.getState();
    expect(state.tasks).toHaveLength(4);
    expect(state.tasks.every((task) => task.repeatEnds === 'after')).toBe(true);
  });
});
