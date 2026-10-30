import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

const media = vi.hoisted(() => ({
  uploadTaskMediaFile: vi.fn(),
}));

vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  buildTaskMediaUrl: (image: { id: string; token: string }) => `https://x/functions/v1/task-media/${image.id}?token=${image.token}`,
  uploadTaskMediaFile: media.uploadTaskMediaFile,
}));

vi.mock('@/infrastructure/tasks/openTaskLiveChannel', () => ({
  subscribeToOpenTaskRows: () => () => {},
}));

vi.mock('@/shared/ui/sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

import { useTaskSubtasks } from '@/features/planner/hooks/useTaskSubtasks';
import { SUBTASK_DRAFT_IMAGES_KEY } from '@/features/planner/hooks/useSubtaskImages';
import type { TaskSubtask } from '@/features/planner/types/planner';

const subtask = (overrides: Partial<TaskSubtask> = {}): TaskSubtask => ({
  id: 'subtask-1',
  taskId: 'task-1',
  title: 'Photo of the crack',
  isDone: false,
  doneAt: null,
  position: 0,
  images: [],
  ...overrides,
});

const png = () => new File(['x'], 'shot.png', { type: 'image/png' });

const setup = (initial: TaskSubtask[] = [subtask()]) => {
  const deps = {
    fetchTaskSubtasks: vi.fn(async () => ({ subtasks: initial })),
    createTaskSubtask: vi.fn(async (_ws: string, taskId: string, title: string, position: number, images = []) => ({
      subtask: subtask({ id: 'subtask-new', taskId, title, position, images }),
    })),
    updateTaskSubtaskTitle: vi.fn(async () => ({})),
    updateTaskSubtaskCompletion: vi.fn(async () => ({})),
    deleteTaskSubtask: vi.fn(async () => ({})),
    updateTaskSubtaskImages: vi.fn(async () => ({})),
    releaseTaskMedia: vi.fn(),
  };
  const hook = renderHook(
    ({ taskId }: { taskId: string | null }) => useTaskSubtasks({
      taskId,
      currentWorkspaceId: 'workspace-1',
      canEdit: true,
      ...deps,
    }),
    { initialProps: { taskId: 'task-1' as string | null } },
  );
  return { ...hook, deps };
};

describe('useTaskSubtasks pictures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let next = 0;
    media.uploadTaskMediaFile.mockImplementation(async () => {
      next += 1;
      return { id: `m${next}`, token: `t${next}` };
    });
  });

  it('uploads a picture onto a subtask and saves the reference', async () => {
    const { result, deps } = setup();
    await waitFor(() => expect(result.current.subtasks).toHaveLength(1));

    act(() => result.current.subtaskImages.attach('subtask-1', [png()]));

    await waitFor(() => expect(deps.updateTaskSubtaskImages).toHaveBeenCalledWith(
      'workspace-1', 'task-1', 'subtask-1', [{ id: 'm1', token: 't1' }],
    ));
    expect(result.current.subtasks[0].images).toEqual([{ id: 'm1', token: 't1' }]);
    expect(result.current.subtaskImages.uploading['subtask-1']).toBeUndefined();
    expect(deps.releaseTaskMedia).not.toHaveBeenCalled();
  });

  it('a failed save puts the list back and lets the uploaded file go', async () => {
    const { result, deps } = setup();
    deps.updateTaskSubtaskImages.mockResolvedValueOnce({ error: 'denied' });
    await waitFor(() => expect(result.current.subtasks).toHaveLength(1));

    act(() => result.current.subtaskImages.attach('subtask-1', [png()]));

    await waitFor(() => expect(deps.releaseTaskMedia).toHaveBeenCalledWith(['m1']));
    expect(result.current.subtasks[0].images).toEqual([]);
  });

  it('removing a picture hands it to media GC only after the save', async () => {
    const { result, deps } = setup([subtask({ images: [{ id: 'm9', token: 't9' }] })]);
    await waitFor(() => expect(result.current.subtasks).toHaveLength(1));
    let resolveSave: (value: object) => void = () => {};
    deps.updateTaskSubtaskImages.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));

    act(() => result.current.subtaskImages.remove('subtask-1', 'm9'));
    await waitFor(() => expect(deps.updateTaskSubtaskImages).toHaveBeenCalledWith('workspace-1', 'task-1', 'subtask-1', []));
    expect(deps.releaseTaskMedia).not.toHaveBeenCalled();

    await act(async () => resolveSave({}));
    expect(deps.releaseTaskMedia).toHaveBeenCalledWith(['m9']);
  });

  it('deleting a subtask lets its pictures go', async () => {
    const { result, deps } = setup([subtask({ images: [{ id: 'm9', token: 't9' }] })]);
    await waitFor(() => expect(result.current.subtasks).toHaveLength(1));

    await act(async () => result.current.handleDeleteSubtask('subtask-1'));

    expect(deps.releaseTaskMedia).toHaveBeenCalledWith(['m9']);
  });

  it('a draft picture is saved with the new subtask', async () => {
    const { result, deps } = setup();
    await waitFor(() => expect(result.current.subtasks).toHaveLength(1));

    act(() => result.current.subtaskImages.attach(null, [png()]));
    await waitFor(() => expect(result.current.subtaskImages.draftImages).toEqual([{ id: 'm1', token: 't1' }]));
    expect(result.current.subtaskImages.uploading[SUBTASK_DRAFT_IMAGES_KEY]).toBeUndefined();

    act(() => result.current.setNewSubtaskTitle('Crack, close-up'));
    await act(async () => result.current.handleAddSubtask());

    expect(deps.createTaskSubtask).toHaveBeenCalledWith(
      'workspace-1', 'task-1', 'Crack, close-up', 1, [{ id: 'm1', token: 't1' }],
    );
    expect(result.current.subtaskImages.draftImages).toEqual([]);
    expect(deps.releaseTaskMedia).not.toHaveBeenCalled();
  });

  it('leaving the task with only draft pictures (no title) lets them go', async () => {
    const { result, deps, rerender } = setup();
    await waitFor(() => expect(result.current.subtasks).toHaveLength(1));

    act(() => result.current.subtaskImages.attach(null, [png()]));
    await waitFor(() => expect(result.current.subtaskImages.draftImages).toHaveLength(1));

    rerender({ taskId: null });

    expect(deps.createTaskSubtask).not.toHaveBeenCalled();
    expect(deps.releaseTaskMedia).toHaveBeenCalledWith(['m1']);
  });

  it('leaving the task with a typed title saves it with its pictures', async () => {
    const { result, deps, rerender } = setup();
    await waitFor(() => expect(result.current.subtasks).toHaveLength(1));

    act(() => result.current.subtaskImages.attach(null, [png()]));
    await waitFor(() => expect(result.current.subtaskImages.draftImages).toHaveLength(1));
    act(() => result.current.setNewSubtaskTitle('Crack'));

    rerender({ taskId: null });

    expect(deps.createTaskSubtask).toHaveBeenCalledWith('workspace-1', 'task-1', 'Crack', 1, [{ id: 'm1', token: 't1' }]);
    expect(deps.releaseTaskMedia).not.toHaveBeenCalled();
  });

  it('Escape-discarding the draft lets its pictures go', async () => {
    const { result, deps } = setup();
    await waitFor(() => expect(result.current.subtasks).toHaveLength(1));
    act(() => result.current.subtaskImages.attach(null, [png()]));
    await waitFor(() => expect(result.current.subtaskImages.draftImages).toHaveLength(1));

    act(() => result.current.subtaskImages.discardDraftImages());

    expect(result.current.subtaskImages.draftImages).toEqual([]);
    expect(deps.releaseTaskMedia).toHaveBeenCalledWith(['m1']);
  });
});
