import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('@/features/planner/store/plannerStore', () => ({
  usePlannerStore: (selector?: (state: typeof plannerState) => unknown) => (
    typeof selector === 'function' ? selector(plannerState) : plannerState
  ),
}));

vi.mock('@/shared/store/localeStore', () => ({
  useLocaleStore: (selector?: (state: { locale: string }) => unknown) => (
    typeof selector === 'function' ? selector({ locale: 'en' }) : { locale: 'en' }
  ),
}));

vi.mock('@/shared/lib/dateFnsLocale', () => ({
  resolveDateFnsLocale: () => undefined,
}));

vi.mock('@/shared/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuItem: ({ children, onSelect, disabled, className }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button type="button" className={className} disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  ContextMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuRadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuRadioItem: ({ children, disabled, value }: {
    children: React.ReactNode;
    disabled?: boolean;
    value: string;
  }) => (
    <button type="button" disabled={disabled} data-value={value}>
      {children}
    </button>
  ),
  ContextMenuSeparator: () => <hr />,
  ContextMenuSub: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ContextMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock('@/shared/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/shared/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (value: boolean) => void }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  ),
}));

vi.mock('@/shared/ui/alert-dialog', () => ({
  AlertDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div data-testid="alert-dialog">{children}</div> : null),
  AlertDialogAction: ({
    children,
    className,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    className,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const moveTask = vi.fn(async () => ({}));

const baseTask = {
  assigneeIds: ['assignee-1'],
  description: '',
  endDate: '2026-02-01',
  id: 'task-1',
  priority: null,
  projectId: 'project-1',
  repeatId: 'repeat-1' as string | null,
  startDate: '2026-02-01',
  statusId: 'status-1',
  tagIds: [],
  title: 'Repeat task',
  typeId: 'type-1',
};

const plannerState = {
  assignees: [{ id: 'assignee-1', isActive: true, name: 'Alex' }],
  commentCount: 0,
  deleteTask: vi.fn(async () => ({})),
  deleteTaskSeries: vi.fn(async () => ({})),
  duplicateTask: vi.fn(async () => ({})),
  groupMode: 'assignee' as const,
  highlightedTaskId: null as string | null,
  moveTask,
  projects: [{ archived: false, code: 'AL', color: '#2563eb', id: 'project-1', name: 'Alpha' }],
  removeAssigneeFromTask: vi.fn(async () => ({})),
  selectedTaskId: null as string | null,
  setHighlightedTaskId: vi.fn(),
  setSelectedTaskId: vi.fn(),
  statuses: [{ color: '#94a3b8', emoji: null, id: 'status-1', isCancelled: false, isFinal: false, name: 'Todo' }],
  taskCommentCounts: {} as Record<string, number>,
  taskTypes: [{ icon: null, id: 'type-1', name: 'Task' }],
  tasks: [{ ...baseTask }, { ...baseTask, id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-08' }],
  trackedProjectIds: [] as string[],
  updateTask: vi.fn(async () => ({})),
};

import { TaskBar } from '@/features/planner/components/timeline/TaskBar';

describe('TaskBar repeat move flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plannerState.selectedTaskId = null;
    plannerState.highlightedTaskId = null;
    plannerState.tasks = [{ ...baseTask }, { ...baseTask, id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-08' }];
  });

  it('asks for scope before moving a repeating task by drag', async () => {
    const { container } = render(
      <TaskBar
        canEdit
        dayWidth={10}
        lane={0}
        position={{ left: 0, width: 16 }}
        task={{ ...baseTask }}
        visibleDays={[]}
      />,
    );

    const bar = container.querySelector('[data-task-id="task-1"]');
    expect(bar).not.toBeNull();

    fireEvent.mouseDown(bar!, { button: 0, clientX: 10 });
    fireEvent.mouseMove(document, { clientX: 20 });
    fireEvent.mouseUp(document);

    expect(moveTask).not.toHaveBeenCalled();
    expect(await screen.findByText('Apply changes to repeating tasks?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('This and following'));

    expect(moveTask).toHaveBeenCalledWith('task-1', '2026-02-02', '2026-02-02', 'following');
  });

  it('asks for scope before resizing a repeating task', async () => {
    const { container } = render(
      <TaskBar
        canEdit
        dayWidth={10}
        lane={0}
        position={{ left: 0, width: 16 }}
        task={{ ...baseTask, endDate: '2026-02-03' }}
        visibleDays={[]}
      />,
    );

    const handles = container.querySelectorAll('.resize-handle');
    expect(handles).toHaveLength(2);

    fireEvent.mouseDown(handles[1], { button: 0, clientX: 10 });
    fireEvent.mouseMove(document, { clientX: 20 });
    fireEvent.mouseUp(document);

    expect(await screen.findByText('Apply changes to repeating tasks?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('All tasks'));

    expect(moveTask).toHaveBeenCalledWith('task-1', '2026-02-01', '2026-02-04', 'all');
  });

  it('moves a non-repeating task immediately without opening the scope dialog', () => {
    const { container } = render(
      <TaskBar
        canEdit
        dayWidth={10}
        lane={0}
        position={{ left: 0, width: 16 }}
        task={{ ...baseTask, repeatId: null }}
        visibleDays={[]}
      />,
    );

    const bar = container.querySelector('[data-task-id="task-1"]');
    expect(bar).not.toBeNull();

    fireEvent.mouseDown(bar!, { button: 0, clientX: 10 });
    fireEvent.mouseMove(document, { clientX: 20 });
    fireEvent.mouseUp(document);

    expect(screen.queryByText('Apply changes to repeating tasks?')).not.toBeInTheDocument();
    expect(moveTask).toHaveBeenCalledWith('task-1', '2026-02-02', '2026-02-02', 'single');
  });

  it('detaches the occurrence from its series when choosing "Only this task"', async () => {
    const { container } = render(
      <TaskBar
        canEdit
        dayWidth={10}
        lane={0}
        position={{ left: 0, width: 16 }}
        task={{ ...baseTask }}
        visibleDays={[]}
      />,
    );

    const bar = container.querySelector('[data-task-id="task-1"]');
    fireEvent.mouseDown(bar!, { button: 0, clientX: 10 });
    fireEvent.mouseMove(document, { clientX: 20 });
    fireEvent.mouseUp(document);

    expect(await screen.findByText('Apply changes to repeating tasks?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Only this task'));

    // Detaching writes the move AND clears repeatId in one update, so the task
    // is standalone afterwards and won't re-open the scope dialog on next edit.
    expect(plannerState.updateTask).toHaveBeenCalledWith(
      'task-1',
      { startDate: '2026-02-02', endDate: '2026-02-02', repeatId: null },
      'single',
    );
    expect(moveTask).not.toHaveBeenCalled();
  });
});
