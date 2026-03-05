import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RealtimePayload = {
  eventType: string;
  old: { id?: unknown } | null;
  new: { id?: unknown } | null;
};

type QueryResult<T> = Promise<{ data: T; error: { message: string } | null }>;

type QueryContext = {
  workspaceId: string;
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const emptyResult = { data: [], error: null };

const supabaseMocks = vi.hoisted(() => {
  let taskHandler: ((payload: RealtimePayload) => void) | null = null;
  let milestoneHandler: ((payload: RealtimePayload) => void) | null = null;
  let statusHandler: ((status: string) => void) | null = null;

  const channelApi = {
    on: vi.fn((
      _event: string,
      filter: { table?: string },
      handler: (payload: RealtimePayload) => void,
    ) => {
      if (filter.table === 'tasks') {
        taskHandler = handler;
      }
      if (filter.table === 'milestones') {
        milestoneHandler = handler;
      }
      return channelApi;
    }),
    subscribe: vi.fn((handler: (status: string) => void) => {
      statusHandler = handler;
      return channelApi;
    }),
  };

  return {
    from: vi.fn(),
    channel: vi.fn(() => channelApi),
    removeChannel: vi.fn(),
    emitTaskUpsert: (taskId: string) => {
      if (!taskHandler) {
        throw new Error('Task realtime handler is not attached');
      }
      taskHandler({
        eventType: 'INSERT',
        old: null,
        new: { id: taskId },
      });
    },
    emitMilestoneUpsert: (milestoneId: string) => {
      if (!milestoneHandler) {
        throw new Error('Milestone realtime handler is not attached');
      }
      milestoneHandler({
        eventType: 'INSERT',
        old: null,
        new: { id: milestoneId },
      });
    },
    emitStatus: (status: string) => {
      if (!statusHandler) {
        throw new Error('Realtime status handler is not attached');
      }
      statusHandler(status);
    },
  };
});

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    from: supabaseMocks.from,
    channel: supabaseMocks.channel,
    removeChannel: supabaseMocks.removeChannel,
  },
}));

import { usePlannerLiveSync } from '@/features/planner/hooks/usePlannerLiveSync';
import { usePlannerStore } from '@/features/planner/store/plannerStore';

const workspaceOne = 'ws-live-1';
const workspaceTwo = 'ws-live-2';
const INITIAL_RECONCILE_DELAY_MS = 15_000;

const rangeFor = (workspaceId: string) => ({
  start: '2026-03-01',
  end: '2026-03-31',
  viewMode: 'week' as const,
  workspaceId,
});

const taskRowFor = (workspaceId: string, id = 'task-1') => ({
  id,
  workspace_id: workspaceId,
  title: `Realtime task ${workspaceId}`,
  project_id: null,
  assignee_id: null,
  assignee_ids: [],
  start_date: '2026-03-10',
  end_date: '2026-03-11',
  status_id: 'status-open',
  type_id: 'type-task',
  priority: 'medium' as const,
  tag_ids: [],
  description: null,
  repeat_id: null,
  updated_at: '2026-03-10T10:00:00.000Z',
});

type RealtimeHandlers = {
  taskFlush?: (ids: string[], ctx: QueryContext) => QueryResult<unknown[]>;
  taskDelta?: (ctx: QueryContext) => QueryResult<unknown[]>;
  taskIds?: (ctx: QueryContext) => QueryResult<Array<{ id: string }>>;
  milestoneFlush?: (ids: string[], ctx: QueryContext) => QueryResult<unknown[]>;
  milestoneDelta?: (ctx: QueryContext) => QueryResult<unknown[]>;
  milestoneIds?: (ctx: QueryContext) => QueryResult<Array<{ id: string }>>;
};

const createRealtimeFromMock = (handlers: RealtimeHandlers = {}) => {
  const taskFlush = handlers.taskFlush ?? (() => Promise.resolve(emptyResult));
  const taskDelta = handlers.taskDelta ?? (() => Promise.resolve(emptyResult));
  const taskIds = handlers.taskIds ?? (() => Promise.resolve(emptyResult));
  const milestoneFlush = handlers.milestoneFlush ?? (() => Promise.resolve(emptyResult));
  const milestoneDelta = handlers.milestoneDelta ?? (() => Promise.resolve(emptyResult));
  const milestoneIds = handlers.milestoneIds ?? (() => Promise.resolve(emptyResult));

  return (table: string) => {
    if (table === 'tasks') {
      return {
        select: (_columns: string) => ({
          eq: (_field: string, workspaceId: string) => {
            const ctx: QueryContext = { workspaceId };
            return {
              in: (_inField: string, ids: string[]) => taskFlush(ids, ctx),
              gt: (_gtField: string, _since: string) => ({
                gte: (_gteField: string, _start: string) => ({
                  lte: (_lteField: string, _end: string) => ({
                    order: (_orderField: string, _opts: { ascending: boolean }) => ({
                      limit: (_limit: number) => taskDelta(ctx),
                    }),
                  }),
                }),
              }),
              gte: (_gteField: string, _start: string) => ({
                lte: (_lteField: string, _end: string) => taskIds(ctx),
              }),
            };
          },
        }),
      };
    }

    if (table === 'milestones') {
      return {
        select: (_columns: string) => ({
          eq: (_field: string, workspaceId: string) => {
            const ctx: QueryContext = { workspaceId };
            return {
              in: (_inField: string, ids: string[]) => milestoneFlush(ids, ctx),
              gt: (_gtField: string, _since: string) => ({
                gte: (_gteField: string, _start: string) => ({
                  lte: (_lteField: string, _end: string) => ({
                    order: (_orderField: string, _opts: { ascending: boolean }) => ({
                      limit: (_limit: number) => milestoneDelta(ctx),
                    }),
                  }),
                }),
              }),
              gte: (_gteField: string, _start: string) => ({
                lte: (_lteField: string, _end: string) => milestoneIds(ctx),
              }),
            };
          },
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  };
};

const LiveSyncProbe = ({
  workspaceId,
  loadedRange,
}: {
  workspaceId: string | null;
  loadedRange: ReturnType<typeof rangeFor> | null;
}) => {
  usePlannerLiveSync(workspaceId, loadedRange);
  return null;
};

describe('usePlannerLiveSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.clear === 'function') {
      window.localStorage.clear();
    }

    usePlannerStore.getState().reset();
    usePlannerStore.setState({ timelineInteractingUntil: Date.now() + 5_000 });

    supabaseMocks.from.mockImplementation(createRealtimeFromMock({
      taskFlush: async () => ({ data: [taskRowFor(workspaceOne)], error: null }),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reschedules deferred upserts and applies them after interaction window ends', async () => {
    const view = render(
      <LiveSyncProbe
        workspaceId={workspaceOne}
        loadedRange={rangeFor(workspaceOne)}
      />,
    );

    act(() => {
      supabaseMocks.emitTaskUpsert('task-1');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    expect(supabaseMocks.from).not.toHaveBeenCalled();
    expect(usePlannerStore.getState().tasks).toHaveLength(0);

    usePlannerStore.setState({ timelineInteractingUntil: 0 });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(220);
    });

    expect(supabaseMocks.from).toHaveBeenCalledWith('tasks');
    expect(usePlannerStore.getState().tasks.map((task) => task.id)).toEqual(['task-1']);

    view.unmount();
  });

  it('does not run reconcile while flush is still in-flight', async () => {
    const flushDeferred = createDeferred<{ data: unknown[]; error: { message: string } | null }>();
    let reconcileStarted = false;

    usePlannerStore.setState({ timelineInteractingUntil: 0 });

    supabaseMocks.from.mockImplementation(createRealtimeFromMock({
      taskFlush: () => flushDeferred.promise,
      taskDelta: async () => {
        reconcileStarted = true;
        return emptyResult;
      },
      taskIds: async () => emptyResult,
      milestoneDelta: async () => emptyResult,
      milestoneIds: async () => emptyResult,
    }));

    const view = render(
      <LiveSyncProbe
        workspaceId={workspaceOne}
        loadedRange={rangeFor(workspaceOne)}
      />,
    );

    act(() => {
      supabaseMocks.emitTaskUpsert('task-1');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    act(() => {
      supabaseMocks.emitStatus('SUBSCRIBED');
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(reconcileStarted).toBe(false);

    await act(async () => {
      flushDeferred.resolve({ data: [taskRowFor(workspaceOne)], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reconcileStarted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INITIAL_RECONCILE_DELAY_MS);
    });

    expect(reconcileStarted).toBe(true);

    view.unmount();
  });

  it('resets fallback failure growth after successful reconcile', async () => {
    usePlannerStore.setState({ timelineInteractingUntil: 0 });

    supabaseMocks.from.mockImplementation(createRealtimeFromMock({
      taskDelta: async () => emptyResult,
      taskIds: async () => emptyResult,
      milestoneDelta: async () => emptyResult,
      milestoneIds: async () => emptyResult,
    }));

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

    const view = render(
      <LiveSyncProbe
        workspaceId={workspaceOne}
        loadedRange={rangeFor(workspaceOne)}
      />,
    );

    act(() => {
      supabaseMocks.emitStatus('CHANNEL_ERROR');
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const firstFallbackDelay = setTimeoutSpy.mock.calls
      .map((call) => Number(call[1]))
      .find((delay) => delay >= 20_000);

    setTimeoutSpy.mockClear();

    act(() => {
      supabaseMocks.emitStatus('CHANNEL_ERROR');
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const secondFallbackDelay = setTimeoutSpy.mock.calls
      .map((call) => Number(call[1]))
      .find((delay) => delay >= 20_000);

    expect(firstFallbackDelay).toBe(90_000);
    expect(secondFallbackDelay).toBe(90_000);

    randomSpy.mockRestore();
    setTimeoutSpy.mockRestore();
    view.unmount();
  });

  it('ignores stale flush results from previous lifecycle after workspace switch', async () => {
    const staleFlushDeferred = createDeferred<{ data: unknown[]; error: { message: string } | null }>();

    usePlannerStore.setState({ timelineInteractingUntil: 0 });

    supabaseMocks.from.mockImplementation(createRealtimeFromMock({
      taskFlush: (_ids, ctx) => {
        if (ctx.workspaceId === workspaceOne) {
          return staleFlushDeferred.promise;
        }
        return Promise.resolve({ data: [taskRowFor(workspaceTwo, 'task-2')], error: null });
      },
    }));

    const view = render(
      <LiveSyncProbe
        workspaceId={workspaceOne}
        loadedRange={rangeFor(workspaceOne)}
      />,
    );

    act(() => {
      supabaseMocks.emitTaskUpsert('task-1');
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });

    view.rerender(
      <LiveSyncProbe
        workspaceId={workspaceTwo}
        loadedRange={rangeFor(workspaceTwo)}
      />,
    );

    await act(async () => {
      staleFlushDeferred.resolve({ data: [taskRowFor(workspaceOne, 'task-1')], error: null });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(usePlannerStore.getState().tasks).toHaveLength(0);

    view.unmount();
  });
});
