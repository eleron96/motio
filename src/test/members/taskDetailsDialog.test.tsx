import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskDetailsDialog } from '@/features/members/components/TaskDetailsDialog';
import { useIsMobile } from '@/shared/hooks/use-mobile';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(),
}));

const useIsMobileMock = vi.mocked(useIsMobile);

const renderDialog = () => render(
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

describe('TaskDetailsDialog', () => {
  beforeEach(() => {
    useIsMobileMock.mockReset();
  });

  it('shows the task comment count in the info card', () => {
    useIsMobileMock.mockReturnValue(false);

    renderDialog();

    expect(screen.getByText('Comments')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('3 comments')).toBeInTheDocument();
  });

  it('opens as a screen with a way back on a phone', () => {
    useIsMobileMock.mockReturnValue(true);

    renderDialog();

    // A screen, not a centred card: it carries a back arrow and the action
    // sits at the bottom as a full-width button.
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to task' })).toBeInTheDocument();
    expect(screen.getByText('Comments')).toBeInTheDocument();
    expect(screen.getByText('Launch checklist')).toBeInTheDocument();
  });
});
