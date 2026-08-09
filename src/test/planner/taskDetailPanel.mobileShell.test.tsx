import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  isMobile: true,
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

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => mocks.isMobile,
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

describe('TaskDetailPanel on mobile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMobile = true;
    mocks.plannerState.selectedTaskId = 'task-1';
    mocks.plannerState.tasks = [{ ...baseTask, createdAt: '2026-01-05T10:00:00.000Z' } as typeof baseTask];
  });

  it('opens as a full-screen screen with a back arrow and pinned actions', () => {
    render(<TaskDetailPanel />);

    const screenEl = screen.getByRole('dialog');
    // Same shell as creating a task: bottom-anchored to the visual viewport.
    expect(screenEl.className).toContain('inset-x-0');
    expect(screenEl.className).not.toContain('translate-y-[-50%]');
    expect(screenEl.style.bottom).toBeTruthy();
    expect(screenEl.style.height).toBeTruthy();

    expect(within(screenEl).getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(within(screenEl).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(screenEl).getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('puts the created/updated line above the actions, not beside them', () => {
    render(<TaskDetailPanel />);

    const meta = screen.getByText(/Created/);
    const done = screen.getByRole('button', { name: 'Done' });
    // The meta line and the buttons share a footer, stacked: meta comes first.
    expect(meta.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the desktop dialog on wide screens', () => {
    mocks.isMobile = false;
    render(<TaskDetailPanel />);

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });
});
