import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

const baseTask = {
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

vi.mock('@/features/planner/components/RepeatSettingsFields', () => ({
  RepeatSettingsFields: ({
    count,
    ends,
    frequency,
    onFrequencyChange,
    until,
  }: {
    count: number;
    ends: 'never' | 'on' | 'after';
    frequency: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
    onFrequencyChange: (value: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly') => void;
    until: string;
  }) => (
    <div>
      <span>
        {{
          none: 'Does not repeat',
          daily: 'Daily',
          weekly: 'Weekly',
          biweekly: 'Biweekly (every 2 weeks)',
          monthly: 'Monthly',
          yearly: 'Yearly',
        }[frequency]}
      </span>
      {frequency !== 'none' && ends === 'after' && (
        <>
          <span>Count</span>
          <input aria-label="Occurrences" readOnly value={count} />
        </>
      )}
      {frequency !== 'none' && ends === 'on' && (
        <input aria-label="End date" readOnly value={until} />
      )}
      <button type="button" onClick={() => onFrequencyChange('weekly')}>
        Set weekly
      </button>
      <button type="button" onClick={() => onFrequencyChange('biweekly')}>
        Set biweekly
      </button>
    </div>
  ),
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
    onApplyPendingRepeatUpdate,
    onSaveAndClose,
    repeatScopeOpen,
    repeatScopeOptions,
  }: {
    onApplyPendingRepeatUpdate: (scope: 'single' | 'following' | 'all') => Promise<void> | void;
    onSaveAndClose: () => Promise<void> | void;
    repeatScopeOpen: boolean;
    repeatScopeOptions?: Array<'single' | 'following' | 'all'>;
  }) => (
    <div>
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

    await user.click(screen.getByRole('button', { name: 'Repeat settings' }));

    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByLabelText('Occurrences')).toHaveValue('2');
    expect(screen.queryByText('Creates repeats for the next 12 months.')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Set biweekly' }));
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
