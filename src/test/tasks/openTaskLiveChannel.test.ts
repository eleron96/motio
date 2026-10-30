import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  names: [] as string[],
  statusCallbacks: [] as Array<(status: string) => void>,
  removed: 0,
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: {
    channel: (name: string) => {
      state.names.push(name);
      const channel = {
        on: () => channel,
        subscribe: (callback: (status: string) => void) => {
          state.statusCallbacks.push(callback);
          return channel;
        },
      };
      return channel;
    },
    removeChannel: async () => { state.removed += 1; },
  },
}));

import { subscribeToOpenTaskRows } from '@/infrastructure/tasks/openTaskLiveChannel';

beforeEach(() => {
  state.names.length = 0;
  state.statusCallbacks.length = 0;
  state.removed = 0;
});

describe('subscribeToOpenTaskRows', () => {
  it('asks to re-read on every subscribe: the first covers changes since the first load', () => {
    const onResync = vi.fn();
    const unsubscribe = subscribeToOpenTaskRows('task_subtasks', 'task-1', vi.fn(), onResync);

    state.statusCallbacks[0]('SUBSCRIBED');
    expect(onResync).toHaveBeenCalledTimes(1);
    state.statusCallbacks[0]('CHANNEL_ERROR');
    expect(onResync).toHaveBeenCalledTimes(1);
    state.statusCallbacks[0]('SUBSCRIBED');
    expect(onResync).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('asks to re-read when the tab becomes visible, and stops after closing', () => {
    const onResync = vi.fn();
    const unsubscribe = subscribeToOpenTaskRows('task_comments', 'task-1', vi.fn(), onResync);

    document.dispatchEvent(new Event('visibilitychange'));
    expect(onResync).toHaveBeenCalledTimes(1);

    unsubscribe();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(state.removed).toBe(1);
  });

  it('gives every subscription its own channel, so reopening a task never reuses a leaving one', () => {
    subscribeToOpenTaskRows('task_subtasks', 'task-1', vi.fn())();
    subscribeToOpenTaskRows('task_subtasks', 'task-1', vi.fn())();

    expect(new Set(state.names).size).toBe(2);
  });
});
