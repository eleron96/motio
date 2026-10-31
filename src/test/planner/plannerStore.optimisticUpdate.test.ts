import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Optimistic single-task writes: the store changes at once, writes to one task
 * go out one after another, a failure rolls back to what the server last
 * confirmed, and live-sync rows that arrive meanwhile are held back.
 */

type Answer = { data: unknown; error: unknown };

const supabaseState = vi.hoisted(() => ({
  pending: [] as Array<{ payload: unknown; resolve: (answer: Answer) => void }>,
}));

vi.mock('@/shared/lib/supabaseClient', () => {
  class MockQueryBuilder {
    payload: unknown = null;
    update(payload: unknown) { this.payload = payload; return this; }
    select() { return this; }
    eq() { return this; }
    single() {
      return new Promise<Answer>((resolve) => {
        supabaseState.pending.push({ payload: this.payload, resolve });
      });
    }
  }
  return {
    supabase: {
      from: () => new MockQueryBuilder(),
      rpc: vi.fn(),
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    },
  };
});

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { Task } from '@/features/planner/types/planner';

const WS = 'ws-1';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Move me',
  projectId: null,
  assigneeIds: ['person-1'],
  startDate: '2026-08-03',
  endDate: '2026-08-04',
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: undefined,
  repeatId: null,
  updatedAt: '2026-08-01T10:00:00.000Z',
  ...overrides,
});

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  workspace_id: WS,
  title: 'Move me',
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
  created_at: '2026-08-01T09:00:00.000Z',
  updated_at: '2026-08-01T10:00:00.000Z',
  ...overrides,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const storedTask = () => usePlannerStore.getState().tasks.find((item) => item.id === 'task-1');

describe('optimistic updateTask', () => {
  beforeEach(() => {
    supabaseState.pending.length = 0;
    usePlannerStore.getState().reset();
    usePlannerStore.setState({ workspaceId: WS, tasks: [task()] });
  });

  it('moves the bar at once, before the server answers', async () => {
    const move = usePlannerStore.getState().moveTask('task-1', '2026-08-10', '2026-08-11', 'single');

    expect(storedTask()).toMatchObject({ startDate: '2026-08-10', endDate: '2026-08-11' });
    await flush();
    expect(supabaseState.pending).toHaveLength(1);

    supabaseState.pending[0].resolve({
      data: row({ start_date: '2026-08-10', end_date: '2026-08-11', updated_at: '2026-08-01T10:05:00.000Z' }),
      error: null,
    });
    await move;
    expect(storedTask()).toMatchObject({ startDate: '2026-08-10', updatedAt: '2026-08-01T10:05:00.000Z' });
    // The move is undoable once it landed.
    expect(usePlannerStore.getState().taskUndoStack).toHaveLength(1);
  });

  it('rolls back and reports when the write fails, without an undo entry', async () => {
    const move = usePlannerStore.getState().moveTask('task-1', '2026-08-10', '2026-08-11', 'single');
    expect(storedTask()?.startDate).toBe('2026-08-10');
    await flush();

    supabaseState.pending[0].resolve({ data: null, error: { message: 'offline' } });
    await move;

    expect(storedTask()).toMatchObject({ startDate: '2026-08-03', endDate: '2026-08-04' });
    expect(usePlannerStore.getState().taskWriteFailure).toMatchObject({ kind: 'save' });
    expect(usePlannerStore.getState().taskUndoStack).toHaveLength(0);
  });

  it('sends two quick moves one after another and keeps the last one', async () => {
    const first = usePlannerStore.getState().updateTask('task-1', { startDate: '2026-08-10', endDate: '2026-08-11' });
    const second = usePlannerStore.getState().updateTask('task-1', { startDate: '2026-08-20', endDate: '2026-08-21' });
    expect(storedTask()?.startDate).toBe('2026-08-20');
    await flush();
    // The second write waits for the first to settle.
    expect(supabaseState.pending).toHaveLength(1);

    supabaseState.pending[0].resolve({
      data: row({ start_date: '2026-08-10', end_date: '2026-08-11', updated_at: '2026-08-01T10:05:00.000Z' }),
      error: null,
    });
    await first;
    await flush();
    // The first answer is stale by now: the screen keeps the second move.
    expect(storedTask()?.startDate).toBe('2026-08-20');
    expect(supabaseState.pending).toHaveLength(2);
    expect(supabaseState.pending[1].payload).toMatchObject({ start_date: '2026-08-20' });

    supabaseState.pending[1].resolve({
      data: row({ start_date: '2026-08-20', end_date: '2026-08-21', updated_at: '2026-08-01T10:06:00.000Z' }),
      error: null,
    });
    await second;
    expect(storedTask()).toMatchObject({ startDate: '2026-08-20', updatedAt: '2026-08-01T10:06:00.000Z' });
  });

  it('holds back a live row during the write and applies it after if it is newer', async () => {
    const move = usePlannerStore.getState().updateTask('task-1', { startDate: '2026-08-10', endDate: '2026-08-11' });
    await flush();

    // A teammate renamed the task while our move was in flight.
    usePlannerStore.getState().upsertTasks([task({ title: 'Renamed by Anna', updatedAt: '2026-08-01T10:07:00.000Z' })]);
    expect(storedTask()).toMatchObject({ startDate: '2026-08-10', title: 'Move me' });

    supabaseState.pending[0].resolve({
      data: row({ start_date: '2026-08-10', end_date: '2026-08-11', updated_at: '2026-08-01T10:05:00.000Z' }),
      error: null,
    });
    await move;
    // The held-back row is newer than our answer, so it wins.
    expect(storedTask()).toMatchObject({ title: 'Renamed by Anna', updatedAt: '2026-08-01T10:07:00.000Z' });
  });

  it('keeps the same object for an echo of a row it already holds', () => {
    const before = storedTask();
    usePlannerStore.getState().upsertTasks([task()]);
    expect(storedTask()).toBe(before);
    usePlannerStore.getState().upsertTasks([task({ updatedAt: '2026-08-01T10:09:00.000Z', title: 'New' })]);
    expect(storedTask()).not.toBe(before);
    expect(storedTask()?.title).toBe('New');
  });
});
