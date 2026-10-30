import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task, TaskSubtask } from '@/features/planner/types/planner';

vi.mock('@lingui/macro', () => ({
  t: (input: TemplateStringsArray | { message?: string }, ...values: unknown[]) => (
    Array.isArray(input)
      ? input.reduce((acc: string, str, index) => acc + str + (values[index] ?? ''), '')
      : (input as { message?: string }).message ?? ''
  ),
}));

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver;
}

const baseTask: Task = {
  id: 'task-1',
  title: 'Repeat task',
  projectId: 'project-1',
  assigneeIds: [],
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  startDate: '2026-02-01',
  endDate: '2026-02-01',
  description: '',
  tagIds: [],
  repeatId: null,
};

const mocks = vi.hoisted(() => ({
  authState: {
    currentWorkspaceId: 'workspace-1',
    currentWorkspaceRole: 'editor',
  },
  plannerState: {
    assignees: [] as Array<{ id: string; isActive: boolean; name: string }>,
    createRepeats: vi.fn(async () => ({ created: 0 })),
    createTaskSubtask: vi.fn(async (): Promise<{ subtask: TaskSubtask | null }> => ({ subtask: null })),
    customers: [] as Array<{ id: string; name: string }>,
    deleteTask: vi.fn(async () => ({})),
    deleteTaskSeries: vi.fn(async () => ({})),
    deleteTaskSubtask: vi.fn(async () => ({})),
    duplicateTask: vi.fn(),
    fetchTaskSubtasks: vi.fn(async () => ({ subtasks: [] })),
    groupMode: 'assignee' as const,
    projects: [
      {
        id: 'project-1',
        archived: false,
        code: 'AL',
        color: '#2563eb',
        customerId: null,
        name: 'Alpha',
      },
    ],
    selectedTaskId: 'task-1',
    setSelectedTaskId: vi.fn(),
    statuses: [
      {
        id: 'status-1',
        color: '#94a3b8',
        emoji: null,
        isCancelled: false,
        isFinal: false,
        name: 'To do',
      },
    ],
    tags: [] as Array<{ id: string; color: string; name: string }>,
    taskTypes: [
      {
        icon: null,
        id: 'type-1',
        name: 'Task',
      },
    ],
    tasks: [] as Array<typeof baseTask>,
    trackedProjectIds: [] as string[],
    updateRepeatSeries: vi.fn(async () => ({ created: 0, deleted: 0, updated: 1 })),
    updateTask: vi.fn(async () => ({})),
    updateTaskSubtaskCompletion: vi.fn(async () => ({})),
    updateTaskSubtaskTitle: vi.fn(async () => ({})),
    revertTaskOwnEdits: vi.fn(async () => {}),
    saveTaskDescription: vi.fn(async (): Promise<'saved' | 'conflict' | 'failed'> => 'saved'),
  },
  liveHandlers: [] as Array<{ table: string; onChange: (change: { type: string; rowId: string }) => void }>,
}));

vi.mock('@/infrastructure/tasks/openTaskLiveChannel', () => ({
  subscribeToOpenTaskRows: (
    table: string,
    _taskId: string,
    onChange: (change: { type: string; rowId: string }) => void,
  ) => {
    const handler = { table, onChange };
    mocks.liveHandlers.push(handler);
    return () => {
      mocks.liveHandlers.splice(mocks.liveHandlers.indexOf(handler), 1);
    };
  },
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector?: (state: typeof mocks.plannerState) => unknown) => (
    typeof selector === 'function' ? selector(mocks.plannerState) : mocks.plannerState
  ),
}));

vi.mock('@/features/auth/store/authStore', () => ({
  useAuthStore: (selector?: (state: typeof mocks.authState) => unknown) => (
    typeof selector === 'function' ? selector(mocks.authState) : mocks.authState
  ),
}));

vi.mock('@/features/planner/hooks/useFilteredAssignees', () => ({
  useFilteredAssignees: (assignees: typeof mocks.plannerState.assignees) => assignees,
}));

vi.mock('@/features/planner/components/TaskProjectSelect', () => ({
  TaskProjectSelect: () => <div data-testid="task-project-select" />,
}));

vi.mock('@/features/planner/components/RichTextEditor', () => ({
  RichTextEditor: ({
    id,
    onBlur,
    onChange,
    value,
  }: {
    id?: string;
    onBlur?: () => void;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label={id ?? 'description'}
      value={value}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/features/planner/components/TaskCommentSection', () => ({
  TaskCommentSection: () => <div data-testid="task-comments" />,
}));

vi.mock('@/features/planner/components/TaskDetailDialogs', () => ({
  TaskDetailAlerts: ({
    confirmOpen,
    onApplyPendingRepeatUpdate,
    onDiscardAndClose,
    onSaveAndClose,
    repeatScopeOpen,
    repeatScopeOptions,
  }: {
    confirmOpen: boolean;
    onApplyPendingRepeatUpdate: (scope: 'single' | 'following' | 'all') => Promise<void> | void;
    onDiscardAndClose: () => void;
    onSaveAndClose: () => Promise<void> | void;
    repeatScopeOpen: boolean;
    repeatScopeOptions?: Array<'single' | 'following' | 'all'>;
  }) => (
    <div>
      {confirmOpen && <span data-testid="confirm-close" />}
      {confirmOpen && (
        <button type="button" onClick={onDiscardAndClose}>
          Discard
        </button>
      )}
      <button type="button" onClick={() => void onSaveAndClose()}>
        Save
      </button>
      {repeatScopeOpen && (
        <div>
          <span data-testid="repeat-scope-options">{(repeatScopeOptions ?? []).join(',')}</span>
          <button
            type="button"
            data-testid="apply-following"
            onClick={() => void onApplyPendingRepeatUpdate('following')}
          >
            Apply following
          </button>
        </div>
      )}
    </div>
  ),
  TaskNotFoundDialog: () => null,
}));

vi.mock('@/shared/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { TaskDetailPanel } from '@/features/planner/components/TaskDetailPanel';

describe('TaskDetailPanel repeat block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plannerState.selectedTaskId = 'task-1';
    mocks.plannerState.tasks = [{ ...baseTask }];
  });

  it('prefills repeat settings from an existing repeat series', async () => {
    const user = userEvent.setup();
    mocks.plannerState.tasks = [
      { ...baseTask, repeatId: 'repeat-1', startDate: '2026-02-01', endDate: '2026-02-01' },
      { ...baseTask, id: 'task-2', repeatId: 'repeat-1', startDate: '2026-02-15', endDate: '2026-02-15' },
    ];

    render(<TaskDetailPanel />);

    // The trigger summarizes the series; full settings live in the popover.
    expect(screen.getByRole('button', { name: 'Repeat settings' })).toHaveTextContent('Biweekly (every 2 weeks)');
    // A counted repeat also surfaces the projected last-occurrence date (muted,
    // 2-digit year): biweekly ×2 from 2026-02-01 lands the last one on 2026-02-15.
    expect(screen.getByRole('button', { name: 'Repeat settings' })).toHaveTextContent('until 15.02.26');

    await user.click(screen.getByRole('button', { name: 'Repeat settings' }));

    // Limit is now a dropdown; a counted series preselects "Count" and shows the input.
    expect(screen.getByLabelText('Repeat limit')).toHaveValue('after');
    expect(screen.getByLabelText('Occurrences')).toHaveValue(2);
    expect(screen.queryByText('Creates repeats for the next 12 months.')).not.toBeInTheDocument();
  });

  it('reads back a persisted "never" mode instead of inferring "after N"', async () => {
    const user = userEvent.setup();
    // A multi-task series would normally be inferred as "after N"; the stored
    // repeatEnds must win so the user can actually keep it on "never".
    mocks.plannerState.tasks = [
      { ...baseTask, repeatId: 'repeat-1', repeatEnds: 'never', startDate: '2026-02-01', endDate: '2026-02-01' },
      { ...baseTask, id: 'task-2', repeatId: 'repeat-1', repeatEnds: 'never', startDate: '2026-02-08', endDate: '2026-02-08' },
    ];

    render(<TaskDetailPanel />);

    await user.click(screen.getByRole('button', { name: 'Repeat settings' }));

    // "never" ⇒ the limit dropdown reads back as never, the 12-months hint shows,
    // and neither the count nor the date input is present, even though the series
    // has more than one task.
    expect(screen.getByLabelText('Repeat limit')).toHaveValue('never');
    expect(screen.getByText('Creates repeats for the next 12 months.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Occurrences')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End date')).not.toBeInTheDocument();
  });

  it('keeps non-repeating task in does-not-repeat state', () => {
    render(<TaskDetailPanel />);

    expect(screen.getByText('Does not repeat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Occurrences')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End date')).not.toBeInTheDocument();
  });

  it('routes repeat cadence changes through the existing scope dialog and rebuild action', async () => {
    const user = userEvent.setup();
    mocks.plannerState.tasks = [
      { ...baseTask, repeatId: 'repeat-1', startDate: '2026-02-01', endDate: '2026-02-01' },
      { ...baseTask, id: 'task-2', repeatId: 'repeat-1', startDate: '2026-02-08', endDate: '2026-02-08' },
    ];

    render(<TaskDetailPanel />);

    await user.click(screen.getByRole('button', { name: 'Repeat settings' }));
    await user.selectOptions(screen.getByLabelText('Repeat type'), 'biweekly');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(mocks.plannerState.createRepeats).not.toHaveBeenCalled();
    expect(screen.getByTestId('repeat-scope-options')).toHaveTextContent('all,following');

    fireEvent.click(screen.getByTestId('apply-following'));

    await waitFor(() => {
      expect(mocks.plannerState.updateRepeatSeries).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          frequency: 'biweekly',
          ends: 'after',
          count: 2,
        }),
        'following',
      );
    });
  });
});

describe('TaskDetailPanel subtask Escape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plannerState.selectedTaskId = 'task-1';
    mocks.plannerState.tasks = [{ ...baseTask }];
    mocks.plannerState.fetchTaskSubtasks = vi.fn(async () => ({
      subtasks: [
        {
          id: 'subtask-1',
          taskId: 'task-1',
          title: 'Check the invoice',
          isDone: false,
          doneAt: null,
          position: 0,
          images: [],
        },
      ],
    }));
  });

  it('keeps the panel open when Escape cancels an inline subtask edit', async () => {
    const user = userEvent.setup();

    render(<TaskDetailPanel />);

    await user.click(await screen.findByRole('button', { name: 'Check the invoice' }));
    await user.type(screen.getByDisplayValue('Check the invoice'), ' twice');
    await user.keyboard('{Escape}');

    // Edit rolled back, task still open: neither the close nor its unsaved-work
    // confirmation fired.
    expect(screen.queryByDisplayValue('Check the invoice twice')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check the invoice' })).toBeInTheDocument();
    expect(mocks.plannerState.setSelectedTaskId).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-close')).not.toBeInTheDocument();
  });

  it('keeps the panel open when Escape clears an unsent subtask draft', async () => {
    const user = userEvent.setup();

    render(<TaskDetailPanel />);

    const composer = await screen.findByPlaceholderText('Subtask title');
    await user.type(composer, 'New subtask');
    await user.keyboard('{Escape}');

    expect(composer).toHaveValue('');
    expect(mocks.plannerState.setSelectedTaskId).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-close')).not.toBeInTheDocument();
  });

  it('still closes the panel on Escape when no subtask text is pending', async () => {
    const user = userEvent.setup();

    render(<TaskDetailPanel />);

    await screen.findByRole('button', { name: 'Check the invoice' });
    await user.keyboard('{Escape}');

    expect(mocks.plannerState.setSelectedTaskId).toHaveBeenCalledWith(null);
  });
});

describe('TaskDetailPanel subtask draft autosave', () => {
  const createdSubtask: TaskSubtask = {
    id: 'subtask-2',
    taskId: 'task-1',
    title: 'Call the client',
    isDone: false,
    doneAt: null,
    position: 1,
    images: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plannerState.selectedTaskId = 'task-1';
    mocks.plannerState.tasks = [{ ...baseTask }];
    mocks.plannerState.fetchTaskSubtasks = vi.fn(async () => ({
      subtasks: [
        {
          id: 'subtask-1',
          taskId: 'task-1',
          title: 'Check the invoice',
          isDone: false,
          doneAt: null,
          position: 0,
          images: [],
        },
      ],
    }));
    mocks.plannerState.createTaskSubtask = vi.fn(async () => ({ subtask: createdSubtask }));
  });

  it('saves the typed word as a subtask once the composer loses focus', async () => {
    const user = userEvent.setup();

    render(<TaskDetailPanel />);

    const composer = await screen.findByPlaceholderText('Subtask title');
    await user.type(composer, 'Call the client');
    await user.tab();

    await screen.findByRole('button', { name: 'Call the client' });
    expect(mocks.plannerState.createTaskSubtask).toHaveBeenCalledTimes(1);
    expect(mocks.plannerState.createTaskSubtask).toHaveBeenCalledWith(
      'workspace-1',
      'task-1',
      'Call the client',
      1,
      [],
    );
    expect(composer).toHaveValue('');
  });

  it('closes without a confirmation and saves the draft once on Done', async () => {
    const user = userEvent.setup();

    const { unmount } = render(<TaskDetailPanel />);

    await user.type(await screen.findByPlaceholderText('Subtask title'), 'Call the client');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(mocks.plannerState.setSelectedTaskId).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('confirm-close')).not.toBeInTheDocument();
    unmount();
    expect(mocks.plannerState.createTaskSubtask).toHaveBeenCalledTimes(1);
  });

  it('saves a draft still in focus when the task is left', async () => {
    const user = userEvent.setup();

    const { unmount } = render(<TaskDetailPanel />);

    await user.type(await screen.findByPlaceholderText('Subtask title'), 'Call the client');
    unmount();

    expect(mocks.plannerState.createTaskSubtask).toHaveBeenCalledTimes(1);
    expect(mocks.plannerState.createTaskSubtask).toHaveBeenCalledWith(
      'workspace-1',
      'task-1',
      'Call the client',
      1,
      [],
    );
  });

  it('drops the draft cleared with Escape', async () => {
    const user = userEvent.setup();

    const { unmount } = render(<TaskDetailPanel />);

    await user.type(await screen.findByPlaceholderText('Subtask title'), 'Call the client');
    await user.keyboard('{Escape}');
    unmount();

    expect(mocks.plannerState.createTaskSubtask).not.toHaveBeenCalled();
  });
});

describe('TaskDetailPanel teammate edits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plannerState.selectedTaskId = 'task-1';
    mocks.plannerState.tasks = [{ ...baseTask }];
    mocks.plannerState.fetchTaskSubtasks = vi.fn(async () => ({ subtasks: [] }));
  });

  it('closes without a warning when only a teammate changed the task', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TaskDetailPanel />);
    await screen.findByDisplayValue('Repeat task');

    // Live sync brings in a teammate's status change.
    mocks.plannerState.tasks = [{ ...baseTask, statusId: 'status-2' }];
    rerender(<TaskDetailPanel />);
    await user.keyboard('{Escape}');

    expect(mocks.plannerState.setSelectedTaskId).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('confirm-close')).not.toBeInTheDocument();
  });

  it('discards only our own edit, leaving the teammate change alone', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<TaskDetailPanel />);

    const title = await screen.findByDisplayValue('Repeat task');
    await user.clear(title);
    await user.type(title, 'My title');
    await user.tab();
    expect(mocks.plannerState.updateTask).toHaveBeenCalledWith('task-1', { title: 'My title' }, 'single');

    // Our save landed, and a teammate changed the status meanwhile.
    mocks.plannerState.tasks = [{ ...baseTask, title: 'My title', statusId: 'status-2' }];
    rerender(<TaskDetailPanel />);
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('confirm-close')).toBeInTheDocument();
    // The modal card hides the alerts mock from role queries.
    fireEvent.click(screen.getByText('Discard'));

    expect(mocks.plannerState.revertTaskOwnEdits).toHaveBeenCalledWith('task-1', {
      title: { from: 'Repeat task', to: 'My title' },
    });
    // The old Discard wrote the whole opening snapshot back.
    expect(mocks.plannerState.updateTask).toHaveBeenCalledTimes(1);
  });
});

describe('TaskDetailPanel live subtasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plannerState.selectedTaskId = 'task-1';
    mocks.plannerState.tasks = [{ ...baseTask }];
  });

  it('shows a subtask a teammate added while the card is open', async () => {
    const teammateSubtask = {
      id: 'subtask-9',
      taskId: 'task-1',
      title: 'Added by Sergey',
      isDone: false,
      doneAt: null,
      position: 0,
      images: [],
    };
    mocks.plannerState.fetchTaskSubtasks = vi.fn()
      .mockResolvedValueOnce({ subtasks: [] })
      .mockResolvedValue({ subtasks: [teammateSubtask] });

    render(<TaskDetailPanel />);
    await screen.findByRole('button', { name: 'Add subtask' });

    const handler = mocks.liveHandlers.find((item) => item.table === 'task_subtasks');
    expect(handler).toBeDefined();
    handler?.onChange({ type: 'INSERT', rowId: 'subtask-9' });

    expect(await screen.findByRole('button', { name: 'Added by Sergey' })).toBeInTheDocument();
  });
});

describe('TaskDetailPanel description conflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plannerState.selectedTaskId = 'task-1';
    mocks.plannerState.tasks = [{ ...baseTask, description: '<p>Base</p>' }];
    mocks.plannerState.fetchTaskSubtasks = vi.fn(async () => ({ subtasks: [] }));
  });

  it('saves over the text it started from and, on a conflict, keeps the draft and asks', async () => {
    mocks.plannerState.saveTaskDescription = vi.fn(async (): Promise<'saved' | 'conflict' | 'failed'> => 'saved')
      .mockResolvedValueOnce('conflict');
    const user = userEvent.setup();
    render(<TaskDetailPanel />);

    const editor = await screen.findByLabelText('description');
    await user.clear(editor);
    await user.type(editor, 'Mine');
    await user.tab();

    expect(mocks.plannerState.saveTaskDescription).toHaveBeenCalledWith('task-1', 'Mine', '<p>Base</p>', {});
    expect(await screen.findByText(/changed the description while you were writing/)).toBeInTheDocument();
    expect(editor).toHaveValue('Mine');

    // Closing now would lose the text: the card stays open.
    await user.keyboard('{Escape}');
    expect(mocks.plannerState.setSelectedTaskId).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(mocks.plannerState.saveTaskDescription).toHaveBeenCalledWith('task-1', 'Mine', '<p>Base</p>', { force: true });
    await waitFor(() => expect(screen.queryByText(/changed the description while you were writing/)).not.toBeInTheDocument());
  });

  it('can take the teammate version instead', async () => {
    mocks.plannerState.saveTaskDescription = vi.fn(async (): Promise<'saved' | 'conflict' | 'failed'> => 'conflict');
    const user = userEvent.setup();
    const { rerender } = render(<TaskDetailPanel />);

    const editor = await screen.findByLabelText('description');
    await user.clear(editor);
    await user.type(editor, 'Mine');
    await user.tab();
    await screen.findByText(/changed the description while you were writing/);

    mocks.plannerState.tasks = [{ ...baseTask, description: '<p>Theirs</p>' }];
    rerender(<TaskDetailPanel />);
    await user.click(screen.getByRole('button', { name: 'Show their version' }));

    expect(editor).toHaveValue('<p>Theirs</p>');
    expect(screen.queryByText(/changed the description while you were writing/)).not.toBeInTheDocument();
  });
});

describe('TaskDetailPanel description saves in a row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plannerState.selectedTaskId = 'task-1';
    mocks.plannerState.tasks = [{ ...baseTask, description: '<p>Base</p>' }];
    mocks.plannerState.fetchTaskSubtasks = vi.fn(async () => ({ subtasks: [] }));
  });

  it('checks the next save against the text the previous one saved, not the old base', async () => {
    let release: (value: 'saved') => void = () => {};
    mocks.plannerState.saveTaskDescription = vi.fn()
      .mockImplementationOnce(() => new Promise<'saved'>((resolve) => { release = resolve; }))
      .mockResolvedValue('saved');
    const user = userEvent.setup();
    render(<TaskDetailPanel />);

    const editor = await screen.findByLabelText('description');
    await user.clear(editor);
    await user.type(editor, 'B');
    await user.tab();
    // Still saving 'B' — the person keeps typing and leaves the field again.
    await user.click(editor);
    await user.type(editor, 'C');
    await user.tab();
    expect(mocks.plannerState.saveTaskDescription).toHaveBeenCalledTimes(1);

    await act(async () => { release('saved'); });

    await waitFor(() => expect(mocks.plannerState.saveTaskDescription).toHaveBeenCalledTimes(2));
    expect(mocks.plannerState.saveTaskDescription).toHaveBeenLastCalledWith('task-1', 'BC', 'B', {});
    expect(screen.queryByText(/changed the description while you were writing/)).not.toBeInTheDocument();
  });

  it('after taking the teammate version, Discard does not roll their text back', async () => {
    mocks.plannerState.saveTaskDescription = vi.fn(async (): Promise<'saved' | 'conflict' | 'failed'> => 'conflict');
    const user = userEvent.setup();
    const { rerender } = render(<TaskDetailPanel />);

    const editor = await screen.findByLabelText('description');
    await user.clear(editor);
    await user.type(editor, 'Mine');
    await user.tab();
    await screen.findByText(/changed the description while you were writing/);

    mocks.plannerState.tasks = [{ ...baseTask, description: '<p>Theirs</p>' }];
    rerender(<TaskDetailPanel />);
    await user.click(screen.getByRole('button', { name: 'Show their version' }));
    await user.keyboard('{Escape}');

    // Nothing of ours stands: the card closes without offering a Discard.
    expect(screen.queryByTestId('confirm-close')).not.toBeInTheDocument();
    expect(mocks.plannerState.revertTaskOwnEdits).not.toHaveBeenCalled();
  });
});
