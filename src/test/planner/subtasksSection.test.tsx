import React, { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

import { SubtasksSection } from '@/features/planner/components/SubtasksSection';
import { TaskSubtask } from '@/features/planner/types/planner';

const subtask: TaskSubtask = {
  id: 'subtask-1',
  taskId: 'task-1',
  title: 'Check the invoice',
  isDone: false,
  doneAt: null,
  position: 0,
  images: [],
};

const onEdit = vi.fn(async () => true);
const onEditingActiveChange = vi.fn();
const onCommitDraft = vi.fn();

const Harness: React.FC = () => {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <SubtasksSection
      isReadOnly={false}
      subtasksOpen
      subtasksLoading={false}
      subtasksSaving={false}
      subtasksError=""
      subtasks={[subtask]}
      newSubtaskTitle={newSubtaskTitle}
      completedSubtasksCount={0}
      subtaskInputRef={subtaskInputRef}
      onOpen={vi.fn()}
      onNewTitleChange={setNewSubtaskTitle}
      onAdd={vi.fn()}
      onCommitDraft={onCommitDraft}
      onEdit={onEdit}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
      onEditingActiveChange={onEditingActiveChange}
    />
  );
};

describe('SubtasksSection Escape handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels an inline edit and reports that no edit is open anymore', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Check the invoice' }));
    const editor = screen.getByDisplayValue('Check the invoice');
    await user.type(editor, ' twice');
    expect(onEditingActiveChange).toHaveBeenLastCalledWith(true);

    await user.keyboard('{Escape}');

    expect(screen.queryByDisplayValue('Check the invoice twice')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check the invoice' })).toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
    // The panel relies on this to stop gating Escape once the edit is gone.
    expect(onEditingActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('clears a started draft on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const composer = screen.getByPlaceholderText('Subtask title');
    await user.type(composer, 'New subtask');
    await user.keyboard('{Escape}');

    expect(composer).toHaveValue('');
  });
});

describe('SubtasksSection draft trimming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sheds trailing blank lines from the composer on blur', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const composer = screen.getByPlaceholderText('Subtask title');
    await user.type(composer, 'One{Shift>}{Enter}{/Shift}Two{Shift>}{Enter}{/Shift}{Shift>}{Enter}{/Shift}');
    expect(composer).toHaveValue('One\nTwo\n\n');

    await user.tab();

    expect(composer).toHaveValue('One\nTwo');
  });
});

describe('SubtasksSection draft saving on blur', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a typed draft when the composer loses focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText('Subtask title'), 'Call');
    await user.tab();

    expect(onCommitDraft).toHaveBeenCalledTimes(1);
  });

  it('does not save a blank draft on blur', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByPlaceholderText('Subtask title'), '   ');
    await user.tab();

    expect(onCommitDraft).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Subtask title')).toHaveValue('');
  });
});

describe('SubtasksSection live drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a teammate typing a new subtask and an edit under its subtask', () => {
    render(
      <SubtasksSection
        isReadOnly={false}
        subtasksOpen
        subtasksLoading={false}
        subtasksSaving={false}
        subtasksError=""
        subtasks={[subtask]}
        newSubtaskTitle=""
        completedSubtasksCount={0}
        subtaskInputRef={{ current: null }}
        onOpen={vi.fn()}
        onNewTitleChange={vi.fn()}
        onAdd={vi.fn()}
        onCommitDraft={vi.fn()}
        onEdit={onEdit}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        teammateDrafts={[
          { userId: 'anna', name: 'Anna', avatarUrl: null, draft: { kind: 'subtask-new', text: 'Book the room' } },
          { userId: 'sergey', name: 'Sergey', avatarUrl: null, draft: { kind: 'subtask-edit', subtaskId: 'subtask-1', text: 'Check the invoice twice' } },
        ]}
      />,
    );

    expect(screen.getByText('Anna is writing a subtask')).toBeInTheDocument();
    expect(screen.getByText('Book the room')).toBeInTheDocument();
    expect(screen.getByText('Sergey is editing this subtask')).toBeInTheDocument();
    expect(screen.getByText('Check the invoice twice')).toBeInTheDocument();
  });

  it('shares what this person types in the composer', async () => {
    const onShareDraft = vi.fn();
    const SharingHarness: React.FC = () => {
      const [title, setTitle] = useState('');
      return (
        <SubtasksSection
          isReadOnly={false}
          subtasksOpen
          subtasksLoading={false}
          subtasksSaving={false}
          subtasksError=""
          subtasks={[subtask]}
          newSubtaskTitle={title}
          completedSubtasksCount={0}
          subtaskInputRef={{ current: null }}
          onOpen={vi.fn()}
          onNewTitleChange={setTitle}
          onAdd={vi.fn()}
          onCommitDraft={vi.fn()}
          onEdit={onEdit}
          onToggle={vi.fn()}
          onDelete={vi.fn()}
          onShareDraft={onShareDraft}
        />
      );
    };
    const user = userEvent.setup();
    render(<SharingHarness />);

    await user.type(screen.getByPlaceholderText('Subtask title'), 'Hi');

    expect(onShareDraft).toHaveBeenLastCalledWith('subtask-new', { kind: 'subtask-new', text: 'Hi' });
  });
});
