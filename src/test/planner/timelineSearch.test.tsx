import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskSearchStore } from '@/features/planner/store/taskSearchStore';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((text, part, index) => text + part + (values[index] ?? ''), '')
  ),
}));

const mocks = vi.hoisted(() => ({
  focusNext: vi.fn(),
  focusPrevious: vi.fn(),
  openFocused: vi.fn(),
}));
vi.mock('@/features/planner/hooks/useTimelineTaskSearch', () => ({
  useTimelineTaskSearchRunner: () => undefined,
  useTimelineTaskSearchNavigation: () => mocks,
}));
vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: { getState: () => ({ selectedTaskId: null }) },
}));

import { TimelineSearch } from '@/features/planner/components/timeline/TimelineSearch';

describe('timeline search field', () => {
  beforeEach(() => {
    useTaskSearchStore.getState().closeSearch();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('announces task and subtask search while keeping the closed trigger icon-only', () => {
    render(<TimelineSearch />);
    const trigger = screen.getByRole('button', { name: 'Search tasks and subtasks' });
    expect(trigger.textContent).toBe('');
    expect(trigger.title).toMatch(/^Search tasks and subtasks \((⌘K|Ctrl\+K)\)$/);

    fireEvent.click(trigger);

    const input = screen.getByRole('textbox', { name: 'Search tasks and subtasks' });
    expect(input).toHaveAttribute('placeholder', 'Find a task or subtask');
    fireEvent.change(input, { target: { value: 'Review' } });
    expect(useTaskSearchStore.getState().query).toBe('Review');
  });

  it('keeps the shortcut and next-result navigation available', () => {
    render(<TimelineSearch />);
    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true });
    const input = screen.getByRole('textbox', { name: 'Search tasks and subtasks' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(mocks.focusNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
