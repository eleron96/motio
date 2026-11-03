import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Moving the timeline past the loaded window reloads only the windowed data
 * (tasks, time off, comment counts) — not the 14 workspace tables — without a
 * loading state, and keeps the open task, pending deletions and writes in
 * flight as they are on screen.
 */

type Answer = { data: unknown; error: unknown };
type Request = { table: string; filters: Array<[string, string, unknown]> };

const db = vi.hoisted(() => ({
  requests: [] as Request[],
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  tables: {} as Record<string, unknown[]>,
  commentCounts: [] as Array<{ task_id: string; comment_count: number }>,
}));

vi.mock('@/shared/lib/supabaseClient', () => {
  class MockQueryBuilder implements PromiseLike<Answer> {
    request: Request;
    constructor(table: string) {
      this.request = { table, filters: [] };
      db.requests.push(this.request);
    }
    select() { return this; }
    order() { return this; }
    eq(column: string, value: unknown) { this.request.filters.push(['eq', column, value]); return this; }
    gte(column: string, value: unknown) { this.request.filters.push(['gte', column, value]); return this; }
    lte(column: string, value: unknown) { this.request.filters.push(['lte', column, value]); return this; }
    then<R1 = Answer, R2 = never>(
      onFulfilled?: ((value: Answer) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ) {
      const rows = (db.tables[this.request.table] ?? []) as Array<Record<string, unknown>>;
      const filtered = rows.filter((row) => this.request.filters.every(([op, column, value]) => {
        const cell = row[column] as string;
        if (op === 'eq') return cell === value;
        if (op === 'gte') return cell >= (value as string);
        return cell <= (value as string);
      }));
      return Promise.resolve({ data: filtered, error: null }).then(onFulfilled, onRejected);
    }
  }
  return {
    supabase: {
      from: (table: string) => new MockQueryBuilder(table),
      rpc: (name: string, args: Record<string, unknown>) => {
        db.rpcCalls.push({ name, args });
        if (name === 'task_comment_counts_in_window') return Promise.resolve({ data: db.commentCounts, error: null });
        return Promise.resolve({ data: [], error: null });
      },
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  };
});

vi.mock('@/shared/lib/adminConfig', () => ({ getAdminUserId: () => Promise.resolve(null) }));

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { beginTaskWrite, resetTaskWrites } from '@/features/planner/store/plannerStore.pendingWrites';

const WS = 'ws-1';

const taskRow = (id: string, startDate: string, overrides: Record<string, unknown> = {}) => ({
  id,
  workspace_id: WS,
  title: id,
  project_id: null,
  assignee_id: null,
  assignee_ids: [],
  start_date: startDate,
  end_date: startDate,
  status_id: 'status-1',
  type_id: 'type-1',
  priority: null,
  tag_ids: [],
  repeat_id: null,
  repeat_ends: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const tablesRequested = () => db.requests.map((request) => request.table);
const taskIds = () => usePlannerStore.getState().tasks.map((task) => task.id).sort();

const loadAt = async (currentDate: string) => {
  usePlannerStore.setState({ currentDate });
  await usePlannerStore.getState().loadWorkspaceData(WS);
};

beforeEach(() => {
  resetTaskWrites();
  usePlannerStore.getState().reset();
  usePlannerStore.setState({ viewMode: 'day', currentDate: '2026-03-15' });
  db.requests = [];
  db.rpcCalls = [];
  db.commentCounts = [{ task_id: 'march', comment_count: 2 }];
  db.tables = {
    tasks: [
      taskRow('march', '2026-03-15'),
      taskRow('june', '2026-06-10'),
      taskRow('august', '2026-08-20'),
    ],
    projects: [{ id: 'project-1', workspace_id: WS, name: 'North', code: null, color: '#000000', archived: false, customer_id: null, owner_group_id: null, status: null }],
    time_off: [
      { id: 'off-march', workspace_id: WS, assignee_id: 'a-1', start_date: '2026-03-20', end_date: '2026-03-21', note: null },
      { id: 'off-september', workspace_id: WS, assignee_id: 'a-1', start_date: '2026-09-10', end_date: '2026-09-12', note: null },
    ],
  };
});

describe('task window shift', () => {
  it('loads comment counts together with the tasks, by the same window', async () => {
    await loadAt('2026-03-15');

    const call = db.rpcCalls.find((item) => item.name === 'task_comment_counts_in_window');
    expect(call?.args).toEqual({ p_workspace_id: WS, p_start_date: '2025-10-15', p_end_date: '2026-08-15' });
    expect(db.rpcCalls.some((item) => item.name === 'task_comment_counts_batch')).toBe(false);
    expect(usePlannerStore.getState().taskCommentCounts).toEqual({ march: 2, june: 0 });
  });

  it('reloads only the windowed data once the rendered days run past the window', async () => {
    await loadAt('2026-03-15');
    expect(taskIds()).toEqual(['june', 'march']);
    usePlannerStore.setState({ selectedTaskId: 'march', projects: usePlannerStore.getState().projects });
    const projectsBefore = usePlannerStore.getState().projects;
    db.requests = [];

    // Still inside the loaded window, but the timeline now renders up to 15 July
    // and the next two months past that are not loaded.
    const shift = loadAt('2026-05-15');
    expect(usePlannerStore.getState().loading).toBe(false);
    await shift;

    expect(tablesRequested().sort()).toEqual(['tasks', 'time_off']);
    expect(usePlannerStore.getState().loadedRange).toEqual({
      start: '2025-12-15', end: '2026-10-15', viewMode: 'day', workspaceId: WS,
    });
    expect(taskIds()).toEqual(['august', 'june', 'march']);
    expect(usePlannerStore.getState().timeOff.map((item) => item.id)).toEqual(['off-march', 'off-september']);
    expect(usePlannerStore.getState().selectedTaskId).toBe('march');
    expect(usePlannerStore.getState().projects).toBe(projectsBefore);
  });

  it('keeps the open task and the cached objects of unchanged tasks', async () => {
    await loadAt('2026-03-15');
    const juneBefore = usePlannerStore.getState().tasks.find((task) => task.id === 'june');
    usePlannerStore.setState({ selectedTaskId: 'march' });

    // The new window (2026-04-20 … 2027-02-20) no longer holds March.
    await loadAt('2026-09-20');

    expect(taskIds()).toEqual(['august', 'june', 'march']);
    expect(usePlannerStore.getState().selectedTaskId).toBe('march');
    expect(usePlannerStore.getState().tasks.find((task) => task.id === 'june')).toBe(juneBefore);
    expect(usePlannerStore.getState().taskCommentCounts).toEqual({ march: 2, june: 0, august: 0 });
  });

  it('does not bring back a task whose deletion can still be undone, nor overwrite one being written', async () => {
    await loadAt('2026-03-15');
    usePlannerStore.setState((state) => ({
      pendingDeleteTaskIds: ['june'],
      tasks: state.tasks
        .filter((task) => task.id !== 'june')
        .map((task) => (task.id === 'march' ? { ...task, startDate: '2026-03-16', endDate: '2026-03-16' } : task)),
    }));
    beginTaskWrite('march', null);

    await loadAt('2026-05-15');

    expect(taskIds()).toEqual(['august', 'march']);
    expect(usePlannerStore.getState().tasks[0].startDate).toBe('2026-03-16');
  });

  it('asks once when the same window is requested again while it is loading', async () => {
    usePlannerStore.setState({ currentDate: '2026-03-15' });
    const first = usePlannerStore.getState().loadWorkspaceData(WS);
    const second = usePlannerStore.getState().loadWorkspaceData(WS);
    await Promise.all([first, second]);

    expect(tablesRequested().filter((table) => table === 'tasks')).toHaveLength(1);
  });

  it('goes back to a full load for another workspace', async () => {
    await loadAt('2026-03-15');
    db.requests = [];

    await usePlannerStore.getState().loadWorkspaceData('ws-2');

    expect(tablesRequested()).toContain('projects');
    expect(usePlannerStore.getState().loadedRange?.workspaceId).toBe('ws-2');
  });

  it('keeps the same time-off list when a shift reads it unchanged', async () => {
    db.tables.time_off = db.tables.time_off.filter((record) => (record as { id: string }).id === 'off-march');
    await loadAt('2026-03-15');
    const before = usePlannerStore.getState().timeOff;

    // The only record stays inside the new window: nothing changed.
    await loadAt('2026-04-20');

    expect(usePlannerStore.getState().loadedRange?.start).toBe('2025-11-20');
    expect(usePlannerStore.getState().timeOff).toBe(before);
  });
});

