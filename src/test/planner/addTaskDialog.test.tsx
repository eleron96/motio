import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

const mocks = vi.hoisted(() => ({
  plannerState: {
    projects: [
      {
        id: 'project-1',
        name: 'Alpha',
        code: 'AL',
        color: '#2563eb',
        archived: false,
        customerId: null,
      },
    ],
    trackedProjectIds: [] as string[],
    assignees: [] as Array<{
      id: string;
      name: string;
      avatar?: string;
      userId?: string | null;
      isActive: boolean;
    }>,
    statuses: [
      {
        id: 'status-1',
        name: 'To do',
        emoji: null,
        color: '#94a3b8',
        isFinal: false,
        isCancelled: false,
      },
    ],
    taskTypes: [
      {
        id: 'type-1',
        name: 'Task',
        icon: null,
      },
    ],
    tags: [] as Array<{ id: string; name: string; color: string }>,
    groupMode: 'assignee' as const,
    addTask: vi.fn(async (task) => ({
      id: 'task-1',
      ...task,
    })),
    createRepeats: vi.fn(async () => ({})),
    createTaskSubtasks: vi.fn(async () => ({})),
  },
  authState: {
    currentWorkspaceId: 'workspace-1',
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

vi.mock('@/features/planner/components/RichTextEditor', () => ({
  RichTextEditor: ({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={id ?? 'description'}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import { AddTaskDialog } from '@/features/planner/components/AddTaskDialog';

describe('AddTaskDialog project defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a task without a project when opened without project context', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <AddTaskDialog
        open
        onOpenChange={onOpenChange}
      />,
    );

    await screen.findByLabelText('Title *');
    await user.type(screen.getByLabelText('Title *'), 'Task without project');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(mocks.plannerState.addTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Task without project',
        projectId: null,
      }));
    });
  });

  it('keeps the contextual project when the dialog is opened from a project row', async () => {
    const user = userEvent.setup();

    render(
      <AddTaskDialog
        open
        onOpenChange={vi.fn()}
        initialProjectId="project-1"
      />,
    );

    await screen.findByLabelText('Title *');
    await user.type(screen.getByLabelText('Title *'), 'Contextual project task');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(mocks.plannerState.addTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Contextual project task',
        projectId: 'project-1',
      }));
    });
  });
});
