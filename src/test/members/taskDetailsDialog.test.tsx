import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskDetailsDialog } from '@/features/members/components/TaskDetailsDialog';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

describe('TaskDetailsDialog', () => {
  it('shows the task comment count in the info card', () => {
    render(
      <TaskDetailsDialog
        open
        onOpenChange={vi.fn()}
        selectedTask={{
          id: 'task-1',
          title: 'Launch checklist',
          statusId: 'status-1',
          assigneeIds: [],
          startDate: '2026-03-11',
          endDate: '2026-03-12',
          typeId: 'type-1',
          priority: 'High',
          tagIds: [],
          description: '',
        } as never}
        selectedTaskProject={null}
        statusById={new Map([['status-1', { id: 'status-1', name: 'In Progress', emoji: null } as never]])}
        assigneeById={new Map()}
        taskTypeById={new Map([['type-1', { id: 'type-1', name: 'Task' } as never]])}
        selectedTaskTags={[]}
        selectedTaskDescription=""
        selectedTaskCommentCount={3}
        onOpenTaskInTimeline={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Comments')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('3 comments')).toBeInTheDocument();
  });
});
