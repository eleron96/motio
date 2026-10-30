import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    releaseTaskMedia: vi.fn(),
  },
  upload: vi.fn(async () => ({ id: 'm1', token: 't1' })),
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

vi.mock('@/infrastructure/tasks/taskMediaRepository', () => ({
  uploadTaskMediaFile: mocks.upload,
  buildTaskMediaUrl: (image: { id: string; token: string }) => `https://app.example/functions/v1/task-media/${image.id}?token=${image.token}`,
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

describe('AddTaskDialog draft subtasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a line break inside the draft subtask instead of starting a new one', async () => {
    const user = userEvent.setup();

    render(
      <AddTaskDialog
        open
        onOpenChange={vi.fn()}
      />,
    );

    await screen.findByLabelText('Title *');
    await user.type(screen.getByLabelText('Title *'), 'Task with a multiline subtask');
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    const subtaskField = screen.getByPlaceholderText('Subtask title');
    await user.type(subtaskField, 'first line{enter}second line');

    expect(screen.getAllByPlaceholderText('Subtask title')).toHaveLength(1);
    expect(subtaskField).toHaveValue('first line\nsecond line');

    await user.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(mocks.plannerState.createTaskSubtasks).toHaveBeenCalledWith(
        'workspace-1',
        'task-1',
        ['first line\nsecond line'],
      );
    });
  });

  it('sheds trailing blank lines once the draft subtask loses focus', async () => {
    const user = userEvent.setup();

    render(
      <AddTaskDialog
        open
        onOpenChange={vi.fn()}
      />,
    );

    await screen.findByLabelText('Title *');
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    const subtaskField = screen.getByPlaceholderText('Subtask title');
    await user.type(subtaskField, 'first line{enter}second line{enter}{enter}{enter}');
    expect(subtaskField).toHaveValue('first line\nsecond line\n\n\n');

    await user.click(screen.getByLabelText('Title *'));

    // Only the trailing emptiness goes; the line break inside stays.
    expect(subtaskField).toHaveValue('first line\nsecond line');
  });

  it('adds another draft subtask from the button and drops the empty ones', async () => {
    const user = userEvent.setup();

    render(
      <AddTaskDialog
        open
        onOpenChange={vi.fn()}
      />,
    );

    await screen.findByLabelText('Title *');
    await user.type(screen.getByLabelText('Title *'), 'Task with two subtasks');

    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    await user.type(screen.getByPlaceholderText('Subtask title'), 'Filled');
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));

    expect(screen.getAllByPlaceholderText('Subtask title')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(mocks.plannerState.createTaskSubtasks).toHaveBeenCalledWith(
        'workspace-1',
        'task-1',
        ['Filled'],
      );
    });
  });
});

describe('AddTaskDialog draft subtask pictures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ id: 'm1', token: 't1' });
  });

  const png = () => new File(['x'], 'shot.png', { type: 'image/png' });

  it('a picture added before the task exists is saved with its subtask', async () => {
    const user = userEvent.setup();
    render(<AddTaskDialog open onOpenChange={vi.fn()} />);

    await user.type(await screen.findByLabelText('Title *'), 'Fix the stairs');
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    await user.type(screen.getByPlaceholderText('Subtask title'), 'Photo of the crack');
    await user.click(screen.getByRole('button', { name: 'Add image' }));
    await user.upload(screen.getByTestId('draft-subtask-image-input'), png());
    expect(await screen.findByRole('button', { name: 'Open image' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(mocks.plannerState.createTaskSubtasks).toHaveBeenCalledWith(
        'workspace-1',
        'task-1',
        ['Photo of the crack'],
        [[{ id: 'm1', token: 't1' }]],
      );
    });
    expect(mocks.plannerState.releaseTaskMedia).not.toHaveBeenCalled();
  });

  it('a screenshot pasted into a draft subtask goes onto it', async () => {
    const user = userEvent.setup();
    render(<AddTaskDialog open onOpenChange={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Add subtask' }));
    const field = screen.getByPlaceholderText('Subtask title');
    const shot = png();
    fireEvent.paste(field, {
      clipboardData: {
        getData: () => '',
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => shot }],
        files: [shot],
      },
    });

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith('workspace-1', shot));
    expect(await screen.findByRole('button', { name: 'Open image' })).toBeInTheDocument();
  });

  it('asks for a title instead of silently dropping pictures on an untitled draft', async () => {
    const user = userEvent.setup();
    render(<AddTaskDialog open onOpenChange={vi.fn()} />);

    await user.type(await screen.findByLabelText('Title *'), 'Fix the stairs');
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    await user.click(screen.getByRole('button', { name: 'Add image' }));
    await user.upload(screen.getByTestId('draft-subtask-image-input'), png());
    await screen.findByRole('button', { name: 'Open image' });

    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await screen.findByText('Give the subtask with pictures a title, or remove it.')).toBeInTheDocument();
    expect(mocks.plannerState.addTask).not.toHaveBeenCalled();
    expect(mocks.plannerState.releaseTaskMedia).not.toHaveBeenCalled();
  });

  it('creates the task only after a picture still uploading has landed, and cancelling meanwhile creates nothing', async () => {
    let finish: (value: { id: string; token: string }) => void = () => {};
    mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(<AddTaskDialog open onOpenChange={onOpenChange} />);

    await user.type(await screen.findByLabelText('Title *'), 'Fix the stairs');
    await user.click(screen.getByRole('button', { name: 'Add subtask' }));
    await user.type(screen.getByPlaceholderText('Subtask title'), 'Photo');
    await user.click(screen.getByRole('button', { name: 'Add image' }));
    await user.upload(screen.getByTestId('draft-subtask-image-input'), png());

    await user.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByRole('button', { name: 'Uploading images…' })).toBeInTheDocument();
    expect(mocks.plannerState.addTask).not.toHaveBeenCalled();

    // The person gives up before the picture lands: the form closes.
    rerender(<AddTaskDialog open={false} onOpenChange={onOpenChange} />);
    finish({ id: 'm9', token: 't9' });

    await waitFor(() => expect(mocks.plannerState.releaseTaskMedia).toHaveBeenCalledWith(['m9']));
    expect(mocks.plannerState.addTask).not.toHaveBeenCalled();
  });

  it('closing the form without creating hands the uploaded pictures back', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AddTaskDialog open onOpenChange={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Add subtask' }));
    await user.click(screen.getByRole('button', { name: 'Add image' }));
    await user.upload(screen.getByTestId('draft-subtask-image-input'), png());
    await screen.findByRole('button', { name: 'Open image' });

    rerender(<AddTaskDialog open={false} onOpenChange={vi.fn()} />);

    await waitFor(() => expect(mocks.plannerState.releaseTaskMedia).toHaveBeenCalledWith(['m1']));
    expect(mocks.plannerState.createTaskSubtasks).not.toHaveBeenCalled();
  });
});
