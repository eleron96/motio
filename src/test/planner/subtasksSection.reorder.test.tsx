import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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

const subtask = (id: string, position: number, isDone = false): TaskSubtask => ({
  id,
  taskId: 'task-1',
  title: `Step ${id}`,
  isDone,
  doneAt: isDone ? '2026-10-30T12:00:00.000Z' : null,
  position,
  images: [],
});

const subtasks = [subtask('a', 0), subtask('b', 1, true), subtask('c', 2)];

const renderSection = (props: Partial<React.ComponentProps<typeof SubtasksSection>> = {}) => render(
  <SubtasksSection
    isReadOnly={false}
    subtasksOpen
    subtasksLoading={false}
    subtasksSaving={false}
    subtasksError=""
    subtasks={subtasks}
    newSubtaskTitle=""
    completedSubtasksCount={1}
    subtaskInputRef={{ current: null }}
    onOpen={vi.fn()}
    onNewTitleChange={vi.fn()}
    onAdd={vi.fn()}
    onCommitDraft={vi.fn()}
    onEdit={vi.fn(async () => true)}
    onToggle={vi.fn()}
    onDelete={vi.fn()}
    {...props}
  />,
);

// Rows are 30px tall with a 2px gap: tops 0, 32, 64.
const ROW_HEIGHT = 30;
const ROW_STEP = 32;
const originalRect = HTMLElement.prototype.getBoundingClientRect;

beforeEach(() => {
  HTMLElement.prototype.getBoundingClientRect = function getRect(this: HTMLElement) {
    const rows = Array.from(document.querySelectorAll('[data-testid="subtask-row"]'));
    const index = rows.indexOf(this);
    const top = index < 0 ? 0 : index * ROW_STEP;
    return { top, height: ROW_HEIGHT, bottom: top + ROW_HEIGHT, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  };
});

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect;
});

describe('SubtasksSection numbering', () => {
  it('numbers subtasks in list order, done ones included', () => {
    renderSection();
    const rows = screen.getAllByTestId('subtask-row');
    expect(rows.map((row) => row.textContent)).toEqual(['1.Step a', '2.Step b', '3.Step c']);
  });

  it('read-only lists keep the numbers but have no drag handles', () => {
    renderSection({ isReadOnly: true, onReorder: vi.fn() });
    expect(screen.getAllByTestId('subtask-row')[2]).toHaveTextContent('3.');
    expect(screen.queryByRole('button', { name: 'Reorder subtask' })).not.toBeInTheDocument();
  });
});

describe('SubtasksSection drag to reorder', () => {
  it('drops a row dragged by its handle past the next one', async () => {
    const onReorder = vi.fn();
    renderSection({ onReorder });
    const handle = screen.getAllByRole('button', { name: 'Reorder subtask' })[0];

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 10, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 10 + 40 });
    // The row follows the pointer, the passed one steps aside.
    const rows = screen.getAllByTestId('subtask-row');
    expect(rows[0].style.transform).toBe('translateY(40px)');
    expect(rows[1].style.transform).toBe(`translateY(-${ROW_STEP}px)`);
    // Numbers follow the would-be order while dragging.
    expect(rows.map((row) => row.textContent)).toEqual(['2.Step a', '1.Step b', '3.Step c']);

    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 50 });
    // It glides into its slot first, and only then the order changes.
    expect(onReorder).not.toHaveBeenCalled();
    await waitFor(() => expect(onReorder).toHaveBeenCalledWith('a', 1));
  });

  it('a release in place changes nothing', async () => {
    const onReorder = vi.fn();
    renderSection({ onReorder });
    const handle = screen.getAllByRole('button', { name: 'Reorder subtask' })[1];

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 40, button: 0 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 45 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 45 });

    await waitFor(() => expect(screen.getAllByTestId('subtask-row')[1].style.transform).toBe(''));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('arrow keys on the handle move a row by one place', () => {
    const onReorder = vi.fn();
    renderSection({ onReorder });
    const handles = screen.getAllByRole('button', { name: 'Reorder subtask' });

    fireEvent.keyDown(handles[1], { key: 'ArrowUp' });
    fireEvent.keyDown(handles[1], { key: 'ArrowDown' });
    fireEvent.keyDown(handles[0], { key: 'ArrowUp' });

    expect(onReorder.mock.calls).toEqual([['b', 0], ['b', 2]]);
  });
});
