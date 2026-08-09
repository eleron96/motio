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
};

const onEdit = vi.fn(async () => true);
const onEditingActiveChange = vi.fn();

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
