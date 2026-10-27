import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * A task write the server rejects must not fail silently: the timeline shows
 * an error toast, and the task stays as the server has it. Drives the real
 * planner store through a queued Supabase mock and observes the toast the
 * user would see.
 */

const supabaseState = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: unknown }>,
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
  plural: (count: number) => String(count),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: toastMocks.error, dismiss: vi.fn() }),
  Toaster: () => null,
}));

vi.mock('@/shared/lib/supabaseClient', () => {
  class MockQueryBuilder {
    update() { return this; }
    select() { return this; }
    delete() { return this; }
    insert() { return this; }
    eq() { return this; }
    is() { return this; }
    in() { return this; }
    gte() { return this; }

    single() {
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
      from: () => new MockQueryBuilder(),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
      },
    },
    getSupabase: () => { throw new Error('not used in tests'); },
  };
});

import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useTaskWriteFailureToasts } from '@/features/planner/hooks/useTaskWriteFailureToasts';
import type { Task } from '@/features/planner/types/planner';

const WS = 'ws-1';
const SAVE_FAILED = "Couldn't save the task. Check your connection and try again.";
const DELETE_FAILED = "Couldn't delete the task. It's back in place.";
const SERVER_DOWN = { data: null, error: { message: 'Failed to fetch' } };

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Draft the brief',
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
  title: 'Draft the brief',
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

const store = () => usePlannerStore.getState();

beforeEach(() => {
  supabaseState.queue.length = 0;
  toastMocks.error.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  usePlannerStore.setState({
    workspaceId: WS,
    tasks: [task()],
    taskUndoStack: [],
    pendingDeleteTaskIds: [],
  });
  renderHook(() => useTaskWriteFailureToasts());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('task write failures are shown to the user', () => {
  it('a rejected edit shows an error toast and keeps the saved text', async () => {
    supabaseState.queue.push(SERVER_DOWN);

    await act(() => store().updateTask('task-1', { description: '<p>New notes</p>' }));

    expect(toastMocks.error).toHaveBeenCalledWith(SAVE_FAILED);
    expect(store().tasks[0].description).toBeNull();
  });

  it('a rejected drag keeps the task on its old dates, shows the toast, and offers no undo', async () => {
    supabaseState.queue.push(SERVER_DOWN);

    await act(() => store().moveTask('task-1', '2026-08-10', '2026-08-11', 'single'));

    expect(toastMocks.error).toHaveBeenCalledWith(SAVE_FAILED);
    expect(store().tasks[0].startDate).toBe('2026-08-03');
    expect(store().taskUndoStack).toHaveLength(0);
  });

  it('a rejected duplicate shows the save toast', async () => {
    supabaseState.queue.push(SERVER_DOWN);

    await act(() => store().duplicateTask('task-1'));

    expect(toastMocks.error).toHaveBeenCalledWith(SAVE_FAILED);
    expect(store().tasks).toHaveLength(1);
  });

  it('a delete the server rejects after the undo window puts the task back and says so', async () => {
    vi.useFakeTimers();
    await act(() => store().deleteTaskDeferred('task-1'));
    expect(store().tasks).toHaveLength(0);

    supabaseState.queue.push({ data: [taskRow()], error: null }); // описания для media GC
    supabaseState.queue.push(SERVER_DOWN); // DELETE

    await act(() => vi.advanceTimersByTimeAsync(7100));

    expect(toastMocks.error).toHaveBeenCalledWith(DELETE_FAILED);
    expect(store().tasks.map((item) => item.id)).toEqual(['task-1']);
  });

  it('a rejected series delete restores the series and says so', async () => {
    usePlannerStore.setState({ tasks: [task({ repeatId: 'repeat-1' })] });
    supabaseState.queue.push({ data: [], error: null }); // описания для media GC
    supabaseState.queue.push(SERVER_DOWN); // DELETE

    await act(() => store().deleteTaskSeries('repeat-1', '2026-08-03'));

    expect(toastMocks.error).toHaveBeenCalledWith(DELETE_FAILED);
    expect(store().tasks).toHaveLength(1);
  });

  it('every failure gets its own toast, a successful save gets none', async () => {
    supabaseState.queue.push({ data: taskRow({ title: 'Renamed' }), error: null });
    await act(() => store().updateTask('task-1', { title: 'Renamed' }));
    expect(toastMocks.error).not.toHaveBeenCalled();

    supabaseState.queue.push(SERVER_DOWN);
    await act(() => store().updateTask('task-1', { title: 'Again' }));
    supabaseState.queue.push(SERVER_DOWN);
    await act(() => store().updateTask('task-1', { title: 'And again' }));

    expect(toastMocks.error).toHaveBeenCalledTimes(2);
  });
});
