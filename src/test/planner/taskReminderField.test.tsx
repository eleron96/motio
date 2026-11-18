import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), ''),
  plural: (value: number, forms: { one: string; other: string }) => (
    (value === 1 ? forms.one : forms.other).replace('#', String(value))
  ),
}));

// The phone variant lists the options as plain buttons, which jsdom can click.
vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => true,
}));

import { TaskReminderField } from '@/features/planner/components/TaskReminderField';

const renderField = (props: Partial<React.ComponentProps<typeof TaskReminderField>> = {}) => {
  const onChange = vi.fn();
  render(
    <TaskReminderField
      value={null}
      onChange={onChange}
      startDate="2026-11-25"
      assigneeCount={1}
      idPrefix="test"
      {...props}
    />,
  );
  return { onChange };
};

// The field's button is named by its label; its text is the current choice.
const openPicker = () => fireEvent.click(screen.getByRole('button', { name: 'Reminder' }));

describe('TaskReminderField', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Monday 23 November 2026, 12:00 — two days before the task starts.
    vi.setSystemTime(new Date(2026, 10, 23, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the start day, one and two days before and a week before', () => {
    renderField();
    openPicker();

    const dialog = screen.getByRole('dialog', { name: 'Reminder' });
    const labels = Array.from(dialog.querySelectorAll('[role="option"], [role="radio"], button'))
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
    for (const label of ['No reminder', 'On the start day', '1 day before', '2 days before', '1 week before']) {
      expect(labels.some((text) => text?.includes(label)), label).toBe(true);
    }
  });

  it('reports the chosen number of days, and null for no reminder', () => {
    const { onChange } = renderField({ value: 0 });
    openPicker();
    fireEvent.click(screen.getByText('1 day before'));
    expect(onChange).toHaveBeenLastCalledWith(1);

    openPicker();
    fireEvent.click(screen.getAllByText('No reminder').at(-1)!);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('says when the assignees will be notified', () => {
    renderField({ value: 1 });
    expect(screen.getByText('Assignees get a notification on November 24 at 9:00 AM.')).toBeInTheDocument();
  });

  it('says nothing under the field while no reminder is set', () => {
    renderField({ value: null });
    expect(screen.queryByText(/notification on/)).not.toBeInTheDocument();
    expect(screen.queryByText(/already passed/)).not.toBeInTheDocument();
  });

  it('warns when the chosen moment is already behind', () => {
    // 23 November 12:00 is past 09:00 of "two days before the 25th".
    renderField({ value: 2 });
    expect(screen.getByText('This time has already passed, so no reminder will be sent.')).toBeInTheDocument();
  });

  it('asks for an assignee when the task has none', () => {
    renderField({ value: 1, assigneeCount: 0 });
    expect(screen.getByText('Add an assignee: the reminder goes to the people on the task.')).toBeInTheDocument();
  });

  it('does not let a past moment be picked', () => {
    const { onChange } = renderField({ value: null });
    openPicker();
    // A week before 25 November was 18 November.
    fireEvent.click(screen.getByText('1 week before'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
