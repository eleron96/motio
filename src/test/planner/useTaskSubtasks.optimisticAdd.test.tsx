import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));
vi.mock('@/infrastructure/tasks/openTaskLiveChannel', () => ({
  subscribeToOpenTaskRows: () => () => undefined,
}));
vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  buildTaskMediaUrl: () => 'https://x/functions/v1/task-media/m?token=t',
  uploadTaskMediaFile: vi.fn(),
}));
vi.mock('@/shared/ui/sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

import { isPendingSubtaskId, useTaskSubtasks } from '@/features/planner/hooks/useTaskSubtasks';
import type { TaskSubtask } from '@/features/planner/types/planner';

/**
 * A new subtask shows up the moment it is added and the composer is free for
 * the next one; the row becomes the saved subtask when the server answers, and
 * a failure takes it away and gives the text back.
 */

type CreateResult = { subtask?: TaskSubtask; error?: string };

const saved = (id: string, title: string, position: number): TaskSubtask => ({
  id, taskId: 'task-1', title, isDone: false, doneAt: null, position, images: [],
});

const renderSubtasks = () => {
  const answers: Array<(result: CreateResult) => void> = [];
  const deps = {
    fetchTaskSubtasks: vi.fn(async () => ({ subtasks: [] as TaskSubtask[] })),
    createTaskSubtask: vi.fn((_workspaceId: string, _taskId: string, _title: string, _position: number, _images?: unknown[]) => (
      new Promise<CreateResult>((resolve) => { answers.push(resolve); })
    )),
    updateTaskSubtaskTitle: vi.fn(async () => ({})),
    updateTaskSubtaskCompletion: vi.fn(async () => ({})),
    deleteTaskSubtask: vi.fn(async () => ({})),
    updateTaskSubtaskImages: vi.fn(async () => ({})),
    updateTaskSubtaskPositions: vi.fn(async () => ({})),
    releaseTaskMedia: vi.fn(),
  };
  const hook = renderHook(() => useTaskSubtasks({
    taskId: 'task-1',
    currentWorkspaceId: 'workspace-1',
    canEdit: true,
    ...deps,
  }));
  return { ...hook, deps, answers };
};

const type = (result: { current: ReturnType<typeof useTaskSubtasks> }, title: string) => {
  act(() => { result.current.setNewSubtaskTitle(title); });
};

describe('useTaskSubtasks optimistic add', () => {
  it('shows the subtask at once and frees the composer, then swaps in the saved one', async () => {
    const { result, deps, answers } = renderSubtasks();
    await waitFor(() => expect(deps.fetchTaskSubtasks).toHaveBeenCalled());

    type(result, 'Call the client');
    let adding: Promise<void> = Promise.resolve();
    act(() => { adding = result.current.handleAddSubtask(); });

    expect(result.current.newSubtaskTitle).toBe('');
    expect(result.current.subtasks).toHaveLength(1);
    expect(result.current.subtasks[0].title).toBe('Call the client');
    expect(isPendingSubtaskId(result.current.subtasks[0].id)).toBe(true);

    await act(async () => { answers[0]({ subtask: saved('subtask-1', 'Call the client', 0) }); await adding; });

    expect(result.current.subtasks).toEqual([saved('subtask-1', 'Call the client', 0)]);
  });

  it('takes the next subtask while the first one is still saving', async () => {
    const { result, deps, answers } = renderSubtasks();
    await waitFor(() => expect(deps.fetchTaskSubtasks).toHaveBeenCalled());

    type(result, 'First');
    act(() => { void result.current.handleAddSubtask(); });
    type(result, 'Second');
    act(() => { void result.current.handleAddSubtask(); });

    expect(result.current.subtasks.map((item) => item.title)).toEqual(['First', 'Second']);
    expect(deps.createTaskSubtask.mock.calls.map((call) => [call[2], call[3]])).toEqual([['First', 0], ['Second', 1]]);

    await act(async () => {
      answers[1]({ subtask: saved('subtask-2', 'Second', 1) });
      answers[0]({ subtask: saved('subtask-1', 'First', 0) });
    });
    await waitFor(() => expect(result.current.subtasks.map((item) => item.id)).toEqual(['subtask-1', 'subtask-2']));
  });

  it('does not create the same subtask twice on Enter and the blur after it', async () => {
    const { result, deps } = renderSubtasks();
    await waitFor(() => expect(deps.fetchTaskSubtasks).toHaveBeenCalled());

    type(result, 'Once');
    act(() => {
      void result.current.handleAddSubtask();
      void result.current.handleAddSubtask({ refocus: false });
    });

    expect(deps.createTaskSubtask).toHaveBeenCalledTimes(1);
  });

  it('removes the row and gives the text back when saving fails', async () => {
    const { result, deps, answers } = renderSubtasks();
    await waitFor(() => expect(deps.fetchTaskSubtasks).toHaveBeenCalled());

    type(result, 'Will fail');
    let adding: Promise<void> = Promise.resolve();
    act(() => { adding = result.current.handleAddSubtask(); });
    await act(async () => { answers[0]({ error: 'Network error' }); await adding; });

    expect(result.current.subtasks).toEqual([]);
    expect(result.current.newSubtaskTitle).toBe('Will fail');
    expect(result.current.subtasksError).toBe('Network error');
  });

  it('ignores ticks and edits of a row the server does not have yet', async () => {
    const { result, deps } = renderSubtasks();
    await waitFor(() => expect(deps.fetchTaskSubtasks).toHaveBeenCalled());

    type(result, 'Pending');
    act(() => { void result.current.handleAddSubtask(); });
    const pendingId = result.current.subtasks[0].id;

    await act(async () => {
      await result.current.handleToggleSubtask(pendingId, true);
      await result.current.handleEditSubtask(pendingId, 'Renamed');
      await result.current.handleDeleteSubtask(pendingId);
    });

    expect(deps.updateTaskSubtaskCompletion).not.toHaveBeenCalled();
    expect(deps.updateTaskSubtaskTitle).not.toHaveBeenCalled();
    expect(deps.deleteTaskSubtask).not.toHaveBeenCalled();
  });
});
