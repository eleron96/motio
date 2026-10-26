import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
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

// jsdom has no DOMRect; Radix's context menu builds one when it opens.
if (typeof (globalThis as { DOMRect?: unknown }).DOMRect === 'undefined') {
  class DOMRectStub {
    constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
    get top() { return this.y; }
    get left() { return this.x; }
    get right() { return this.x + this.width; }
    get bottom() { return this.y + this.height; }
    toJSON() { return {}; }
    static fromRect(rect: { x?: number; y?: number; width?: number; height?: number } = {}) {
      return new DOMRectStub(rect.x, rect.y, rect.width, rect.height);
    }
  }
  (globalThis as { DOMRect?: unknown }).DOMRect = DOMRectStub;
}

const dataTransfer = () => ({ setData: vi.fn(), getData: vi.fn(), effectAllowed: '', dropEffect: '' });

describe('PlannerBoard', () => {
  const updateTaskWithUndo = vi.fn();
  const onCreateTask = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    usePlannerStore.getState().reset();
    usePlannerStore.getState().clearFilters();
    // The board load answers with the cached tasks: these tests have no date
    // window, so an empty answer would empty the cache mid-test.
    mocks.fetchBoardTasks.mockImplementation(async () => ({ data: usePlannerStore.getState().tasks }));
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

  it('opens the task menu from the ⋯ button without opening the task', async () => {
    render(<PlannerBoard onCreateTask={onCreateTask} />);
    const card = screen.getByText('Write brief').closest('[data-task-id]') as HTMLElement;
    // The ⋯ replays a right click on the card, which is what opens the same
    // Radix context menu (jsdom cannot lay that menu out, so assert the event).
    const onContextMenu = vi.fn();
    card.addEventListener('contextmenu', onContextMenu);

    fireEvent.click(within(card).getByRole('button', { name: 'Task actions' }));

    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('menuitem', { name: /Duplicate task/ })).toBeInTheDocument();
    expect(usePlannerStore.getState().selectedTaskId).toBeNull();
  });

  it('scrolls the board sideways while a card is dragged near its edge', async () => {
    render(<PlannerBoard onCreateTask={onCreateTask} />);
    const board = screen.getByTestId('planner-board');
    // jsdom has no layout: keep scrollLeft as a plain value to observe it.
    let scrollLeft = 0;
    Object.defineProperty(board, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => { scrollLeft = value; },
    });
    vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 1000, top: 0, bottom: 600, width: 1000, height: 600, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const card = screen.getByText('Write brief').closest('[data-task-id]') as HTMLElement;

    fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
    // jsdom drag events carry no pointer position: set it on the event.
    const dragOver = createEvent.dragOver(board, { dataTransfer: dataTransfer() });
    Object.defineProperty(dragOver, 'clientX', { value: 995 });
    fireEvent(board, dragOver);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const scrolled = board.scrollLeft;
    expect(scrolled).toBeGreaterThan(0);

    // The drag ends: the loop stops, the board stays where it is.
    fireEvent.dragEnd(card, { dataTransfer: dataTransfer() });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const afterEnd = board.scrollLeft;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(board.scrollLeft).toBe(afterEnd);
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

  describe('quick filters', () => {
    const people = [
      { id: 'me', name: 'Анна', userId: 'user-me', isActive: true, email: null, phone: null },
      { id: 'boris', name: 'Борис', userId: 'user-b', isActive: true, email: null, phone: null },
      { id: 'vera', name: 'Вера', userId: 'user-v', isActive: true, email: null, phone: null },
    ];

    beforeEach(() => {
      useAuthStore.setState({ user: { id: 'user-me' } as never });
      usePlannerStore.setState({
        assignees: people,
        projects: [
          { id: 'north', name: 'Север', code: null, color: '#3b82f6', archived: false, customerId: null, ownerGroupId: null, status: null },
        ],
        tasks: [
          makeTask({ id: 'Смета по фасаду', assigneeIds: ['me'], projectId: 'north', endDate: '2020-01-01' }),
          makeTask({ id: 'Договор', assigneeIds: ['boris'], projectId: 'south' }),
          makeTask({ id: 'Обмеры', assigneeIds: ['vera'], statusId: 'doing' }),
        ],
      });
    });

    it('closes the project list right after a project is picked', async () => {
      render(<PlannerBoard onCreateTask={onCreateTask} />);
      fireEvent.click(screen.getByRole('button', { name: /Project: all/ }));
      fireEvent.click(await screen.findByRole('option', { name: /Север/ }));

      expect(usePlannerStore.getState().filters.projectIds).toEqual(['north']);
      expect(screen.queryByPlaceholderText('Find a project')).not.toBeInTheDocument();
      // Tasks without a project pass the project filter, as on the timeline.
      expect(cardTitles()).toEqual(['Смета по фасаду', 'Обмеры']);
    });

    it('filters by a people group: cards and the people row narrow to its members', async () => {
      usePlannerStore.setState({
        memberGroups: [{ id: 'design', name: 'Дизайн' }],
        memberGroupAssignments: [{ userId: 'user-v', groupId: 'design' }],
      });
      render(<PlannerBoard onCreateTask={onCreateTask} />);
      expect(screen.getByRole('button', { name: 'Борис' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Group: all/ }));
      fireEvent.click(await screen.findByRole('option', { name: /Дизайн/ }));

      expect(usePlannerStore.getState().filters.groupIds).toEqual(['design']);
      expect(screen.queryByPlaceholderText('Find a group')).not.toBeInTheDocument();
      expect(cardTitles()).toEqual(['Обмеры']);
      expect(screen.queryByRole('button', { name: 'Борис' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Вера' })).toBeInTheDocument();
    });

    it('hides the group filter when the workspace has no groups', () => {
      render(<PlannerBoard onCreateTask={onCreateTask} />);
      expect(screen.queryByRole('button', { name: /Group: all/ })).not.toBeInTheDocument();
    });

    const cardTitles = () => Array.from(document.querySelectorAll('[data-task-id]')).map((el) => el.getAttribute('data-task-id'));

    it('searches card titles without touching the shared filters', () => {
      render(<PlannerBoard onCreateTask={onCreateTask} />);
      fireEvent.change(screen.getByLabelText('Search by title'), { target: { value: 'фасад' } });
      expect(cardTitles()).toEqual(['Смета по фасаду']);
      expect(usePlannerStore.getState().filters.assigneeIds).toEqual([]);
    });

    it('shows only overdue open cards', () => {
      render(<PlannerBoard onCreateTask={onCreateTask} />);
      fireEvent.click(screen.getByRole('button', { name: /Overdue/ }));
      expect(cardTitles()).toEqual(['Смета по фасаду']);
    });

    it('"Mine" and people avatars write into the shared assignee filter', () => {
      render(<PlannerBoard onCreateTask={onCreateTask} />);

      fireEvent.click(screen.getByRole('button', { name: /Mine/ }));
      expect(usePlannerStore.getState().filters.assigneeIds).toEqual(['me']);
      expect(cardTitles()).toEqual(['Смета по фасаду']);

      fireEvent.click(screen.getByRole('button', { name: 'Борис' }));
      expect(usePlannerStore.getState().filters.assigneeIds).toEqual(['me', 'boris']);
      expect(screen.getByRole('button', { name: 'Борис' })).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByRole('button', { name: /Mine/ }));
      expect(usePlannerStore.getState().filters.assigneeIds).toEqual(['boris']);
    });

    it('resets search, overdue and shared filters at once', () => {
      render(<PlannerBoard onCreateTask={onCreateTask} />);
      expect(screen.queryByRole('button', { name: /Reset/ })).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('Search by title'), { target: { value: 'zzz' } });
      fireEvent.click(screen.getByRole('button', { name: 'Вера' }));
      fireEvent.click(screen.getByRole('button', { name: /Reset/ }));

      expect(screen.getByLabelText('Search by title')).toHaveValue('');
      expect(usePlannerStore.getState().filters.assigneeIds).toEqual([]);
      expect(cardTitles()).toHaveLength(3);
    });
  });
});
