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

// Render Radix primitives inline so the menu body is exercised without a real
// right-click. (Lazy mounting itself is guaranteed by Radix Portal-without-
// forceMount; here we verify the wiring and the lazy delete dialog.)
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
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div data-testid="alert-dialog">{children}</div> : null
  ),
  AlertDialogAction: ({ children, className, disabled, onClick }: {
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children, className, onClick }: {
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }) => (
    <button type="button" className={className} onClick={onClick}>{children}</button>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

const baseTask = {
  assigneeIds: ['assignee-1'],
  description: '',
  endDate: '2026-02-01',
  id: 'task-1',
  priority: null,
  projectId: 'project-1',
  repeatId: null as string | null,
  startDate: '2026-02-01',
  statusId: 'status-1',
  tagIds: [] as string[],
  title: 'My task',
  typeId: 'type-1',
};

const plannerState = {
  assignees: [{ id: 'assignee-1', isActive: true, name: 'Alex' }],
  deleteTask: vi.fn(async () => ({})),
  deleteTaskSeries: vi.fn(async () => ({})),
  duplicateTask: vi.fn(async () => ({})),
  groupMode: 'assignee' as const,
  highlightedTaskId: null as string | null,
  moveTask: vi.fn(async () => ({})),
  projects: [{ archived: false, code: 'AL', color: '#2563eb', id: 'project-1', name: 'Alpha' }],
  removeAssigneeFromTask: vi.fn(async () => ({})),
  selectedTaskId: null as string | null,
  setHighlightedTaskId: vi.fn(),
  setSelectedTaskId: vi.fn(),
  statuses: [{ color: '#94a3b8', emoji: null, id: 'status-1', isCancelled: false, isFinal: false, name: 'Todo' }],
  taskCommentCounts: {} as Record<string, number>,
  taskTypes: [{ icon: null, id: 'type-1', name: 'Task' }],
  tasks: [{ ...baseTask }],
  trackedProjectIds: [] as string[],
  updateTask: vi.fn(async () => ({})),
};

import { TaskBar } from '@/features/planner/components/timeline/TaskBar';

const renderBar = (task = baseTask, rowAssigneeId: string | null = null) => render(
  <TaskBar
    canEdit
    dayWidth={10}
    lane={0}
    position={{ left: 0, width: 16 }}
    task={task}
    visibleDays={[]}
    rowAssigneeId={rowAssigneeId}
  />,
);

describe('TaskBar context menu + delete dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plannerState.tasks = [{ ...baseTask }];
  });

  it('renders the menu actions', () => {
    renderBar();
    // "Status"/"Priority" appear twice each (submenu trigger + label).
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Priority').length).toBeGreaterThan(0);
    expect(screen.getByText('Duplicate task')).toBeInTheDocument();
    expect(screen.getByText('Assign project')).toBeInTheDocument();
    expect(screen.getByText('Delete task')).toBeInTheDocument();
  });

  it('duplicates the task from the menu', () => {
    renderBar();
    fireEvent.click(screen.getByText('Duplicate task'));
    expect(plannerState.duplicateTask).toHaveBeenCalledWith('task-1');
  });

  it('mounts the delete dialog lazily and deletes a non-repeating task', async () => {
    renderBar();
    // Dialog not in the DOM until the user requests delete.
    expect(screen.queryByText('Delete task?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Delete task'));

    expect(await screen.findByText('Delete task?')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Delete', { selector: 'button' }));
    expect(plannerState.deleteTask).toHaveBeenCalledWith('task-1');
  });

  it('offers series deletion for a repeating task', async () => {
    renderBar({ ...baseTask, repeatId: 'repeat-1' });

    fireEvent.click(screen.getByText('Delete task'));
    expect(await screen.findByText('Delete repeated task?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Delete this & following'));
    expect(plannerState.deleteTaskSeries).toHaveBeenCalledWith('repeat-1', '2026-02-01');
  });

  it('hides the "only for" scope option when the task has a single assignee', async () => {
    // Deleting from Alex's assignee row, but Alex is the sole assignee: removing
    // them wouldn't delete the task, so the scope checkbox must not appear.
    renderBar(baseTask, 'assignee-1');

    fireEvent.click(screen.getByText('Delete task'));
    expect(await screen.findByText('Delete task?')).toBeInTheDocument();
    expect(screen.queryByText('Only for Alex')).not.toBeInTheDocument();
  });

  it('offers the "only for" scope option when the task has other assignees', async () => {
    renderBar({ ...baseTask, assigneeIds: ['assignee-1', 'assignee-2'] }, 'assignee-1');

    fireEvent.click(screen.getByText('Delete task'));
    expect(await screen.findByText('Delete task?')).toBeInTheDocument();
    expect(screen.getByText('Only for Alex')).toBeInTheDocument();
  });
});
