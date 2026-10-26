import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Status, Task } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
}));

const mocks = vi.hoisted(() => ({
  fetchBoardTasks: vi.fn(),
}));

vi.mock('@/shared/lib/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}));

vi.mock('@/infrastructure/tasks/boardTasksRepository', () => ({
  fetchBoardTasks: mocks.fetchBoardTasks,
  fetchBoardTaskIds: vi.fn(),
  fetchTaskDeltaSince: vi.fn(),
}));

import { PlannerBoard } from '@/features/planner/components/board/PlannerBoard';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';

const statuses: Status[] = [
  { id: 'todo', name: 'To do', emoji: null, color: '#999999', isFinal: false, isCancelled: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'doing', name: 'Doing', emoji: null, color: '#3b82f6', isFinal: false, isCancelled: false, createdAt: '2026-01-02T00:00:00Z' },
  { id: 'done', name: 'Done', emoji: null, color: '#22c55e', isFinal: true, isCancelled: false, createdAt: '2026-01-01T00:00:00Z' },
];

const makeTask = (overrides: Partial<Task> & { id: string }): Task => ({
  title: overrides.id,
  projectId: null,
  assigneeIds: [],
  startDate: '2026-10-20',
  endDate: '2099-10-20',
  statusId: 'todo',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: undefined,
  repeatId: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const dataTransfer = () => ({ setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' });

describe('PlannerBoard', () => {
  const updateTaskWithUndo = vi.fn();
  const onCreateTask = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    usePlannerStore.getState().reset();
    mocks.fetchBoardTasks.mockResolvedValue({ data: [] });
    usePlannerStore.setState({
      workspaceId: 'ws-1',
      statuses,
      tasks: [
        makeTask({ id: 'Write brief' }),
        makeTask({ id: 'Ship it', statusId: 'doing' }),
      ],
      updateTaskWithUndo,
    });
    useAuthStore.setState({ currentWorkspaceRole: 'editor' });
  });

  it('renders one column per status in board order with its cards', () => {
    render(<PlannerBoard onCreateTask={onCreateTask} />);

    const columns = screen.getAllByRole('region');
    expect(columns.map((column) => column.getAttribute('aria-label'))).toEqual(['To do', 'Doing', 'Done']);
    expect(within(columns[0]).getByText('Write brief')).toBeInTheDocument();
    expect(within(columns[1]).getByText('Ship it')).toBeInTheDocument();
    expect(within(columns[2]).getByText('No tasks')).toBeInTheDocument();
  });

  it('claims the board scope on mount and releases it on unmount', () => {
    const view = render(<PlannerBoard onCreateTask={onCreateTask} />);
    expect(mocks.fetchBoardTasks).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      openStatusIds: ['todo', 'doing'],
    }));
    expect(usePlannerStore.getState().boardScope).not.toBeNull();

    view.unmount();
    expect(usePlannerStore.getState().boardScope).toBeNull();
  });

  it('changes the status when a card is dropped on another column', () => {
    render(<PlannerBoard onCreateTask={onCreateTask} />);
    const card = screen.getByText('Write brief').closest('[data-task-id]') as HTMLElement;
    const doneColumn = screen.getByRole('region', { name: 'Done' });

    fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
    fireEvent.dragOver(doneColumn, { dataTransfer: dataTransfer() });
    fireEvent.drop(doneColumn, { dataTransfer: dataTransfer() });

    expect(updateTaskWithUndo).toHaveBeenCalledWith('Write brief', { statusId: 'done' });
  });

  it('does nothing when a card is dropped back on its own column', () => {
    render(<PlannerBoard onCreateTask={onCreateTask} />);
    const card = screen.getByText('Write brief').closest('[data-task-id]') as HTMLElement;
    const todoColumn = screen.getByRole('region', { name: 'To do' });

    fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
    fireEvent.drop(todoColumn, { dataTransfer: dataTransfer() });

    expect(updateTaskWithUndo).not.toHaveBeenCalled();
  });

  it('opens the task panel on click and creates a task in a column', () => {
    render(<PlannerBoard onCreateTask={onCreateTask} />);

    fireEvent.click(screen.getByText('Ship it'));
    expect(usePlannerStore.getState().selectedTaskId).toBe('Ship it');

    const doingColumn = screen.getByRole('region', { name: 'Doing' });
    fireEvent.click(within(doingColumn).getByRole('button', { name: /Add task/ }));
    expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({ statusId: 'doing' }));
  });

  it('shows priority with the timeline exclamation badge', () => {
    usePlannerStore.setState({
      tasks: [
        makeTask({ id: 'Urgent fix', priority: 'high' }),
        makeTask({ id: 'Someday', priority: 'low' }),
        makeTask({ id: 'Plain' }),
      ],
    });
    render(<PlannerBoard onCreateTask={onCreateTask} />);

    expect(screen.getByLabelText('High priority')).toHaveTextContent('‼');
    expect(screen.getByLabelText('Low priority')).toHaveTextContent('!');
    const plainCard = screen.getByText('Plain').closest('[data-task-id]') as HTMLElement;
    expect(within(plainCard).queryByLabelText(/priority/)).not.toBeInTheDocument();
  });

  it('is read-only for viewers: no dragging, no create buttons', () => {
    useAuthStore.setState({ currentWorkspaceRole: 'viewer' });
    render(<PlannerBoard onCreateTask={onCreateTask} />);

    const card = screen.getByText('Write brief').closest('[data-task-id]') as HTMLElement;
    expect(card).toHaveAttribute('draggable', 'false');
    expect(screen.queryByRole('button', { name: /Add task/ })).not.toBeInTheDocument();
  });
});
