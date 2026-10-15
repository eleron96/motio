import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

vi.mock('@/features/planner/store/plannerStore', () => {
  const usePlannerStore = (selector?: (state: typeof plannerState) => unknown) => (
    typeof selector === 'function' ? selector(plannerState) : plannerState
  );
  usePlannerStore.getState = () => plannerState;
  return { usePlannerStore };
});

vi.mock('@/shared/hooks/use-mobile', () => ({
  useIsMobile: () => true,
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
  deleteTaskDeferred: vi.fn(async () => ({})),
  deleteTaskSeries: vi.fn(async () => ({})),
  duplicateTask: vi.fn(async () => ({})),
  groupMode: 'assignee' as const,
  highlightedTaskId: null as string | null,
  moveTask: vi.fn(async () => ({})),
  projects: [{ archived: false, code: 'AL', color: '#2563eb', id: 'project-1', name: 'Alpha' }],
  removeAssigneeFromTask: vi.fn(async () => ({})),
  selectedTaskId: null as string | null,
  peekedTaskId: null as string | null,
  setHighlightedTaskId: vi.fn(),
  setPeekedTaskId: vi.fn((id: string | null) => { plannerState.peekedTaskId = id; }),
  setSelectedTaskId: vi.fn(),
  statuses: [{ color: '#94a3b8', emoji: null, id: 'status-1', isCancelled: false, isFinal: false, name: 'Todo' }],
  taskCommentCounts: {} as Record<string, number>,
  taskTypes: [{ icon: null, id: 'type-1', name: 'Task' }],
  tasks: [{ ...baseTask }],
  trackedProjectIds: [] as string[],
  updateTask: vi.fn(async () => ({})),
  updateTaskWithUndo: vi.fn(async () => ({})),
};

import { TaskBar } from '@/features/planner/components/timeline/TaskBar';

const renderBar = () => render(
  <TaskBar
    canEdit
    dayWidth={10}
    lane={0}
    position={{ left: 0, width: 16 }}
    task={baseTask}
    visibleDays={[]}
  />,
);

const tap = (element: Element) => {
  fireEvent.touchStart(element, { touches: [{ clientX: 5, clientY: 5 }] });
  fireEvent.touchEnd(element, { changedTouches: [{ clientX: 5, clientY: 5 }] });
};

// The tap preview is how a phone looks at a task: while it is open the task is
// published as "peeked", which is what reads its notifications in the inbox.
describe('TaskBar tap preview on a phone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    plannerState.peekedTaskId = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes the task while its preview is open and clears it on dismiss', () => {
    const { container } = renderBar();
    const bar = container.querySelector('[data-task-id="task-1"]')!;

    tap(bar);
    act(() => { vi.advanceTimersByTime(400); });
    expect(plannerState.setPeekedTaskId).toHaveBeenCalledWith('task-1');
    expect(plannerState.peekedTaskId).toBe('task-1');

    // A touch elsewhere closes the preview.
    act(() => { fireEvent.touchStart(document.body); });
    expect(plannerState.peekedTaskId).toBeNull();
  });

  it('does not peek on a double tap, which opens the card instead', () => {
    const { container } = renderBar();
    const bar = container.querySelector('[data-task-id="task-1"]')!;

    tap(bar);
    tap(bar);
    act(() => { vi.advanceTimersByTime(400); });
    expect(plannerState.setSelectedTaskId).toHaveBeenCalledWith('task-1');
    expect(plannerState.setPeekedTaskId).not.toHaveBeenCalled();
  });
});
