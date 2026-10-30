import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

const live = vi.hoisted(() => ({ onChange: null as null | (() => void) }));

vi.mock('@/infrastructure/tasks/openTaskLiveChannel', () => ({
  subscribeToOpenTaskRows: (_table: string, _taskId: string, onChange: () => void) => {
    live.onChange = onChange;
    return () => { live.onChange = null; };
  },
}));
vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  buildTaskMediaUrl: () => 'https://x/functions/v1/task-media/m?token=t',
  uploadTaskMediaFile: vi.fn(),
}));
vi.mock('@/shared/ui/sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

import { useTaskSubtasks } from '@/features/planner/hooks/useTaskSubtasks';
import type { TaskSubtask } from '@/features/planner/types/planner';

const subtask = (isDone: boolean): TaskSubtask => ({
  id: 'subtask-1',
  taskId: 'task-1',
  title: 'Check the invoice',
  isDone,
  doneAt: isDone ? '2026-10-30T12:00:00.000Z' : null,
  position: 0,
  images: [],
});

beforeEach(() => {
  live.onChange = null;
});

describe('useTaskSubtasks live re-read and own ticks', () => {
  it('a re-read that overlaps our tick does not untick the box', async () => {
    // The server says "not done" until our write lands.
    let serverDone = false;
    let finishWrite: () => void = () => {};
    const deps = {
      fetchTaskSubtasks: vi.fn(async () => ({ subtasks: [subtask(serverDone)] })),
      createTaskSubtask: vi.fn(async () => ({})),
      updateTaskSubtaskTitle: vi.fn(async () => ({})),
      updateTaskSubtaskCompletion: vi.fn(() => new Promise<Record<string, never>>((resolve) => {
        finishWrite = () => { serverDone = true; resolve({}); };
      })),
      deleteTaskSubtask: vi.fn(async () => ({})),
      updateTaskSubtaskImages: vi.fn(async () => ({})),
      releaseTaskMedia: vi.fn(),
    };
    const { result } = renderHook(() => useTaskSubtasks({
      taskId: 'task-1',
      currentWorkspaceId: 'workspace-1',
      canEdit: true,
      ...deps,
    }));
    await waitFor(() => expect(result.current.subtasks[0]?.isDone).toBe(false));

    let toggle: Promise<void> = Promise.resolve();
    act(() => { toggle = result.current.handleToggleSubtask('subtask-1', true); });
    expect(result.current.subtasks[0].isDone).toBe(true);

    // A live event (reconnect, a teammate, the tab coming back) re-reads the
    // list while our write is still on its way: the server still says "not done".
    act(() => { live.onChange?.(); });
    await waitFor(() => expect(deps.fetchTaskSubtasks).toHaveBeenCalledTimes(2), { timeout: 1500 });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(result.current.subtasks[0].isDone).toBe(true);

    // The write lands; the next re-read agrees and the box stays ticked.
    await act(async () => { finishWrite(); await toggle; });
    await waitFor(() => expect(deps.fetchTaskSubtasks.mock.calls.length).toBeGreaterThanOrEqual(3), { timeout: 1500 });
    await waitFor(() => expect(result.current.subtasks[0].isDone).toBe(true));
  });
});
