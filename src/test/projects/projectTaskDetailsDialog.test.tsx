import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectTaskDetailsDialog } from '@/features/projects/components/ProjectTaskDetailsDialog';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

const renderDialog = ({ description = '' }: { description?: string } = {}) => render(
  <ProjectTaskDetailsDialog
    open
    onOpenChange={vi.fn()}
    selectedTask={{
      id: 'task-1',
      title: 'Facade pylon',
      statusId: 'status-1',
      assigneeIds: [],
      startDate: '2026-08-14',
      endDate: '2026-08-14',
      typeId: 'type-1',
      priority: null,
      tagIds: [],
      description,
    } as never}
    selectedTaskProject={null}
    selectedTaskCustomer={null}
    selectedTaskRepeatMeta={null}
    statusById={new Map([['status-1', { id: 'status-1', name: 'To Do', emoji: null } as never]])}
    assigneeById={new Map()}
    taskTypeById={new Map([['type-1', { id: 'type-1', name: 'BIM support' } as never]])}
    selectedTaskTags={[]}
    selectedTaskDescription={description}
    onGoToTask={vi.fn()}
    onClose={vi.fn()}
  />,
);

describe('ProjectTaskDetailsDialog', () => {
  it('scrolls a long description inside a capped card, buttons outside it', () => {
    renderDialog({ description: 'A radius pylon family. '.repeat(200) });

    // The card takes a height ceiling instead of growing past the viewport.
    expect(screen.getByRole('dialog').className).toContain('max-h-[85svh]');

    // The description lives in the scrollport; the actions sit below it, so they
    // stay reachable however long the text runs.
    const scrollport = screen.getByTestId('project-task-details-scroll');
    expect(scrollport.className).toContain('overflow-y-auto');
    expect(scrollport).toHaveTextContent('A radius pylon family.');
    expect(scrollport).not.toContainElement(screen.getByRole('button', { name: 'Go to task' }));
    screen.getAllByRole('button', { name: 'Close' }).forEach((button) => {
      expect(scrollport).not.toContainElement(button);
    });
  });
});
