import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  shared: [] as unknown[],
  left: 0,
  onState: null as null | ((state: Record<string, unknown[]>) => void),
  authState: {
    user: { id: 'me' },
    members: [
      { userId: 'me', email: 'me@example.test', displayName: 'Me', avatarUrl: null },
      { userId: 'anna', email: 'anna@example.test', displayName: 'Anna', avatarUrl: null },
    ],
  },
}));

vi.mock('@/infrastructure/tasks/taskDraftsChannel', () => ({
  joinTaskDraftsChannel: (_taskId: string, _userId: string, onState: (state: Record<string, unknown[]>) => void) => {
    mocks.onState = onState;
    return {
      share: (meta: unknown) => { mocks.shared.push(meta); },
      leave: () => { mocks.left += 1; },
    };
  },
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mocks.authState) => unknown) => selector(mocks.authState),
}));

import { useTaskDraftPresence } from '@/features/planner/hooks/useTaskDraftPresence';

beforeEach(() => {
  vi.useFakeTimers();
  mocks.shared.length = 0;
  mocks.left = 0;
  mocks.onState = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTaskDraftPresence', () => {
  it('shares the first keystroke at once and the rest of a burst once per interval', () => {
    const { result } = renderHook(() => useTaskDraftPresence({ taskId: 'task-1', enabled: true }));

    act(() => {
      result.current.shareDraft('subtask-new', { kind: 'subtask-new', text: 'C' });
      result.current.shareDraft('subtask-new', { kind: 'subtask-new', text: 'Ca' });
      result.current.shareDraft('subtask-new', { kind: 'subtask-new', text: 'Call' });
    });
    expect(mocks.shared).toEqual([{ userId: 'me', drafts: [{ kind: 'subtask-new', text: 'C' }] }]);

    act(() => { vi.advanceTimersByTime(300); });
    expect(mocks.shared.at(-1)).toEqual({ userId: 'me', drafts: [{ kind: 'subtask-new', text: 'Call' }] });
    expect(mocks.shared).toHaveLength(2);
  });

  it('keeps each slot: a comment draft stays while a subtask is typed', () => {
    const { result } = renderHook(() => useTaskDraftPresence({ taskId: 'task-1', enabled: true }));

    act(() => { result.current.shareDraft('comment', { kind: 'comment', text: 'Looks good' }); });
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { result.current.shareDraft('subtask-new', { kind: 'subtask-new', text: 'Send' }); });

    expect(mocks.shared.at(-1)).toEqual({
      userId: 'me',
      drafts: [{ kind: 'comment', text: 'Looks good' }, { kind: 'subtask-new', text: 'Send' }],
    });
  });

  it('returns teammates with their names, and leaves the channel when the card closes', () => {
    const { result, unmount } = renderHook(() => useTaskDraftPresence({ taskId: 'task-1', enabled: true }));

    act(() => {
      mocks.onState?.({ anna: [{ userId: 'anna', drafts: [{ kind: 'comment', text: 'On it' }] }] });
    });
    expect(result.current.teammateDrafts).toEqual([
      { userId: 'anna', draft: { kind: 'comment', text: 'On it' }, name: 'Anna', avatarUrl: null },
    ]);

    unmount();
    expect(mocks.left).toBe(1);
  });

  it('does nothing while disabled (phone, flag off)', () => {
    const { result } = renderHook(() => useTaskDraftPresence({ taskId: 'task-1', enabled: false }));

    act(() => { result.current.shareDraft('comment', { kind: 'comment', text: 'x' }); });

    expect(mocks.onState).toBeNull();
    expect(mocks.shared).toEqual([]);
  });
});
