import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '@/features/planner/types/planner';

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
    createTaskSubtask: vi.fn(async () => ({ subtask: null })),
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
    onSaveAndClose,
    repeatScopeOpen,
    repeatScopeOptions,
  }: {
    confirmOpen: boolean;
    onApplyPendingRepeatUpdate: (scope: 'single' | 'following' | 'all') => Promise<void> | void;
    onSaveAndClose: () => Promise<void> | void;
    repeatScopeOpen: boolean;
    repeatScopeOptions?: Array<'single' | 'following' | 'all'>;
  }) => (
    <div>
      {confirmOpen && <span data-testid="confirm-close" />}
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
    // A draft counts as unsaved work, so an unguarded Escape would pop the
    // close confirmation instead of just emptying the field.
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
