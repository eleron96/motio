import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => {
  let taskHandler: ((payload: {
    eventType: string;
    old: { id?: unknown } | null;
    new: { id?: unknown } | null;
  }) => void) | null = null;

  const channelApi = {
    on: vi.fn((
      _event: string,
      filter: { table?: string },
      handler: (payload: {
        eventType: string;
        old: { id?: unknown } | null;
        new: { id?: unknown } | null;
      }) => void,
    ) => {
      if (filter.table === 'tasks') {
        taskHandler = handler;
      }
      return channelApi;
    }),
    subscribe: vi.fn(() => channelApi),
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

const workspaceId = 'ws-live';
const loadedRange = {
  start: '2026-03-01',
  end: '2026-03-31',
  viewMode: 'week' as const,
  workspaceId,
};

const upsertedTaskRow = {
  id: 'task-1',
  workspace_id: workspaceId,
  title: 'Realtime task',
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
};

const LiveSyncProbe = () => {
  usePlannerLiveSync(workspaceId, loadedRange);
  return null;
};

describe('usePlannerLiveSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    usePlannerStore.getState().reset();
    usePlannerStore.setState({ timelineInteractingUntil: Date.now() + 5_000 });

    const inQuery = vi.fn().mockResolvedValue({
      data: [upsertedTaskRow],
      error: null,
    });
    const eqQuery = vi.fn().mockReturnValue({ in: inQuery });
    const selectQuery = vi.fn().mockReturnValue({ eq: eqQuery });

    supabaseMocks.from.mockImplementation((table: string) => {
      if (table === 'tasks') {
        return { select: selectQuery };
      }
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reschedules deferred upserts and applies them after interaction window ends', async () => {
    const view = render(<LiveSyncProbe />);

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

    expect(supabaseMocks.from).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.from).toHaveBeenCalledWith('tasks');
    expect(usePlannerStore.getState().tasks.map((task) => task.id)).toEqual(['task-1']);

    view.unmount();
  });
});
