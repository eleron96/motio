import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));
vi.mock('@/infrastructure/tasks/openTaskLiveChannel', () => ({
  subscribeToOpenTaskRows: () => () => {},
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

const subtask = (id: string, position: number): TaskSubtask => ({
  id,
  taskId: 'task-1',
  title: `Step ${id}`,
  isDone: false,
  doneAt: null,
  position,
  images: [],
});

const setup = () => {
  const initial = [subtask('a', 0), subtask('b', 1), subtask('c', 2)];
  const deps = {
    fetchTaskSubtasks: vi.fn(async () => ({ subtasks: initial })),
    createTaskSubtask: vi.fn(async () => ({})),
    updateTaskSubtaskTitle: vi.fn(async () => ({})),
    updateTaskSubtaskCompletion: vi.fn(async () => ({})),
    deleteTaskSubtask: vi.fn(async () => ({})),
    updateTaskSubtaskImages: vi.fn(async () => ({})),
    updateTaskSubtaskPositions: vi.fn(async (): Promise<{ error?: string }> => ({})),
    releaseTaskMedia: vi.fn(),
  };
  const hook = renderHook(() => useTaskSubtasks({
    taskId: 'task-1',
    currentWorkspaceId: 'workspace-1',
    canEdit: true,
    ...deps,
  }));
  return { ...hook, deps };
};

const order = (subtasks: TaskSubtask[]) => subtasks.map((item) => item.id);

describe('useTaskSubtasks reorder', () => {
  it('moves a subtask at once and writes only the changed positions', async () => {
    const { result, deps } = setup();
    await waitFor(() => expect(result.current.subtasks).toHaveLength(3));

    await act(async () => { await result.current.handleReorderSubtask('a', 1); });

    expect(order(result.current.subtasks)).toEqual(['b', 'a', 'c']);
    expect(deps.updateTaskSubtaskPositions).toHaveBeenCalledWith('workspace-1', 'task-1', [
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ]);
  });

  it('a failed write puts the list back as the server has it', async () => {
    const { result, deps } = setup();
    await waitFor(() => expect(result.current.subtasks).toHaveLength(3));
    deps.updateTaskSubtaskPositions.mockResolvedValueOnce({ error: 'denied' });

    await act(async () => { await result.current.handleReorderSubtask('c', 0); });

    expect(order(result.current.subtasks)).toEqual(['a', 'b', 'c']);
    expect(result.current.subtasksError).toBe('Failed to reorder subtasks.');
  });

  it('a move to the same place writes nothing', async () => {
    const { result, deps } = setup();
    await waitFor(() => expect(result.current.subtasks).toHaveLength(3));

    await act(async () => { await result.current.handleReorderSubtask('b', 1); });

    expect(deps.updateTaskSubtaskPositions).not.toHaveBeenCalled();
  });
});
