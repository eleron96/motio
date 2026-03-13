import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
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
    updateTask: vi.fn(async () => ({})),
    updateTaskSubtaskCompletion: vi.fn(async () => ({})),
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
  TaskDetailAlerts: () => null,
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

  it('prefills repeat settings from an existing repeat series', () => {
    mocks.plannerState.tasks = [
      { ...baseTask, repeatId: 'repeat-1', startDate: '2026-02-01', endDate: '2026-02-01' },
      { ...baseTask, id: 'task-2', repeatId: 'repeat-1', startDate: '2026-02-15', endDate: '2026-02-15' },
    ];

    render(<TaskDetailPanel />);

    expect(screen.getByText('Biweekly (every 2 weeks)')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByLabelText('Occurrences')).toHaveValue(2);
    expect(screen.queryByText('Creates repeats for the next 12 months.')).not.toBeInTheDocument();
  });

  it('keeps non-repeating task in does-not-repeat state', () => {
    render(<TaskDetailPanel />);

    expect(screen.getByText('Does not repeat')).toBeInTheDocument();
    expect(screen.queryByLabelText('Occurrences')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('End date')).not.toBeInTheDocument();
  });
});
