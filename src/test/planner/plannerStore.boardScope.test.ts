import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Status, Task } from '@/features/planner/types/planner';

const mocks = vi.hoisted(() => ({
  fetchBoardTasks: vi.fn(),
  fetchTaskCommentCounts: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

vi.mock('@/infrastructure/tasks/boardTasksRepository', () => ({
  fetchBoardTasks: mocks.fetchBoardTasks,
  fetchBoardTaskIds: vi.fn(),
  fetchTaskDeltaSince: vi.fn(),
}));

vi.mock('@/infrastructure/tasks/taskCommentsRepository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchTaskCommentCounts: mocks.fetchTaskCommentCounts,
}));

import { usePlannerStore } from '@/features/planner/store/plannerStore';

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 'task-1',
  title: 'Task',
  projectId: null,
  assigneeIds: [],
  startDate: '2026-03-10',
  endDate: '2026-03-12',
  statusId: 'todo',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: undefined,
  repeatId: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const statuses: Status[] = [
  { id: 'todo', name: 'To do', emoji: null, color: '#999999', isFinal: false, isCancelled: false },
  { id: 'done', name: 'Done', emoji: null, color: '#22c55e', isFinal: true, isCancelled: false },
];

const loadedRange = { start: '2026-03-01', end: '2026-03-31', viewMode: 'day' as const, workspaceId: 'ws-1' };

describe('plannerStore board scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlannerStore.getState().reset();
    mocks.fetchTaskCommentCounts.mockResolvedValue({ data: {} });
    usePlannerStore.setState({
      workspaceId: 'ws-1',
      statuses,
      loadedRange,
      tasks: [makeTask({ id: 'window-task', statusId: 'done' })],
    });
  });

  it('claims the scope from open statuses and merges board tasks into the cache', async () => {
    mocks.fetchBoardTasks.mockResolvedValue({
      data: [makeTask({ id: 'far-open', startDate: '2027-02-01', endDate: '2027-02-01' })],
    });

    await usePlannerStore.getState().loadBoardTasks('ws-1');

    const state = usePlannerStore.getState();
    expect(mocks.fetchBoardTasks).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      openStatusIds: ['todo'],
    }));
    expect(state.boardScope?.openStatusIds).toEqual(['todo']);
    expect(state.tasks.map((task) => task.id)).toEqual(['window-task', 'far-open']);
    expect(mocks.fetchTaskCommentCounts).toHaveBeenCalledWith('ws-1', ['far-open']);
  });

  it('does nothing for another workspace or before statuses are loaded', async () => {
    await usePlannerStore.getState().loadBoardTasks('ws-2');
    usePlannerStore.setState({ statuses: [] });
    await usePlannerStore.getState().loadBoardTasks('ws-1');

    expect(mocks.fetchBoardTasks).not.toHaveBeenCalled();
    expect(usePlannerStore.getState().boardScope).toBeNull();
  });

  it('ignores a board response that arrives after the scope was released', async () => {
    let resolveFetch!: (value: { data: Task[] }) => void;
    mocks.fetchBoardTasks.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const pending = usePlannerStore.getState().loadBoardTasks('ws-1');
    usePlannerStore.getState().releaseBoardScope();
    resolveFetch({ data: [makeTask({ id: 'far-open', startDate: '2027-02-01', endDate: '2027-02-01' })] });
    await pending;

    const state = usePlannerStore.getState();
    expect(state.boardScope).toBeNull();
    expect(state.tasks.map((task) => task.id)).toEqual(['window-task']);
  });

  it('release drops tasks only the board held and closes their panel', async () => {
    mocks.fetchBoardTasks.mockResolvedValue({
      data: [makeTask({ id: 'far-open', startDate: '2027-02-01', endDate: '2027-02-01' })],
    });
    await usePlannerStore.getState().loadBoardTasks('ws-1');
    usePlannerStore.setState({ selectedTaskId: 'far-open', taskCommentCounts: { 'far-open': 2, 'window-task': 1 } });

    usePlannerStore.getState().releaseBoardScope();

    const state = usePlannerStore.getState();
    expect(state.boardScope).toBeNull();
    expect(state.tasks.map((task) => task.id)).toEqual(['window-task']);
    expect(state.selectedTaskId).toBeNull();
    expect(state.taskCommentCounts).toEqual({ 'window-task': 1 });
  });
});
