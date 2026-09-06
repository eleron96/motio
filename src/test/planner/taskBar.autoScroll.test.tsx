import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';

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

const moveTask = vi.fn(async (_taskId: string, _startDate: string, _endDate: string, _scope: string) => ({}));

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
  tagIds: [],
  title: 'Plain task',
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
  moveTaskDetached: vi.fn(async () => ({})),
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
import {
  TimelineDragScrollContext,
  type TaskDragState,
  type TimelineDragScrollController,
} from '@/features/planner/components/timeline/TimelineDragScrollContext';
import { DRAG_EDGE_MAX_SPEED } from '@/features/planner/lib/dragAutoScroll';

// A stand-in for the grid's scroll container: jsdom does no layout, so the
// scroll metrics are plain fields the test can read and poke.
const makeContainer = () => {
  const listeners = new Set<() => void>();
  return {
    scrollLeft: 0,
    scrollWidth: 5000,
    clientWidth: 800,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    fireScroll: () => listeners.forEach((listener) => listener()),
  };
};

// Manual animation frames so the auto-scroll loop advances only when asked.
const frames: FrameRequestCallback[] = [];
const runFrame = () => {
  const pending = frames.splice(0, frames.length);
  pending.forEach((callback) => callback(performance.now()));
};

const renderBar = (container: ReturnType<typeof makeContainer>, bounds = { left: 200, right: 1000 }) => {
  const states: TaskDragState[] = [];
  const controller: TimelineDragScrollController = {
    getScrollContainer: () => container as unknown as HTMLDivElement,
    getViewportBounds: () => bounds,
    setTaskDragState: (state) => states.push(state),
  };
  const utils = render(
    <TimelineDragScrollContext.Provider value={controller}>
      <TaskBar
        canEdit
        dayWidth={10}
        lane={0}
        position={{ left: 300, width: 16 }}
        task={{ ...baseTask }}
        visibleDays={[]}
      />
    </TimelineDragScrollContext.Provider>,
  );
  const bar = utils.container.querySelector('[data-task-id="task-1"]') as HTMLElement;
  return { ...utils, bar, states };
};

describe('TaskBar drag with timeline auto-scroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    frames.length = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts the scroll travelled under the bar toward the new date', () => {
    const container = makeContainer();
    const { bar } = renderBar(container);

    fireEvent.mouseDown(bar, { button: 0, clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 510 });
    // The timeline scrolled 200px (20 days) while the mouse barely moved.
    container.scrollLeft = 200;
    act(() => container.fireScroll());
    // The bar visibly follows the grid, not just the mouse.
    expect(bar.style.left).toBe(`${300 + 10 + 200}px`);

    fireEvent.mouseUp(document);

    expect(moveTask).toHaveBeenCalledWith('task-1', '2026-02-22', '2026-02-22', 'single');
  });

  it('scrolls the timeline by itself while the cursor sits in the right edge strip', () => {
    const container = makeContainer();
    const { bar, states } = renderBar(container);

    fireEvent.mouseDown(bar, { button: 0, clientX: 500 });
    // Well inside the strip at the far right of the date area.
    fireEvent.mouseMove(document, { clientX: 999 });
    expect(states.at(-1)).toEqual({ active: true, edge: null });

    act(() => runFrame());
    expect(container.scrollLeft).toBeGreaterThan(0);
    expect(container.scrollLeft).toBeLessThanOrEqual(DRAG_EDGE_MAX_SPEED);
    expect(states.at(-1)).toEqual({ active: true, edge: 'right' });

    // The loop keeps going frame after frame until the cursor leaves the strip.
    const afterFirst = container.scrollLeft;
    act(() => runFrame());
    expect(container.scrollLeft).toBeGreaterThan(afterFirst);

    fireEvent.mouseMove(document, { clientX: 600 });
    act(() => runFrame());
    const settled = container.scrollLeft;
    act(() => runFrame());
    expect(container.scrollLeft).toBe(settled);
    expect(states.at(-1)).toEqual({ active: true, edge: null });

    fireEvent.mouseUp(document);
    expect(states.at(-1)).toEqual({ active: false, edge: null });
    // Mouse travel (100px) plus what auto-scroll added, in whole days.
    const expectedDays = Math.round((100 + settled) / 10);
    expect(moveTask).toHaveBeenCalledTimes(1);
    expect(moveTask.mock.calls[0][1]).toBe(
      new Date(Date.UTC(2026, 1, 1 + expectedDays)).toISOString().slice(0, 10),
    );
  });

  it('stops at the end of the scroll range instead of looping forever', () => {
    const container = makeContainer();
    container.scrollLeft = container.scrollWidth - container.clientWidth;
    const { bar } = renderBar(container);

    fireEvent.mouseDown(bar, { button: 0, clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 999 });
    act(() => runFrame());
    expect(container.scrollLeft).toBe(container.scrollWidth - container.clientWidth);
    // Nothing was scheduled: the loop ended on the clamped edge.
    expect(frames).toHaveLength(0);
    fireEvent.mouseUp(document);
  });

  it('never activates the drag state on a plain click', () => {
    const container = makeContainer();
    const { bar, states } = renderBar(container);

    fireEvent.mouseDown(bar, { button: 0, clientX: 500 });
    fireEvent.mouseUp(document);

    expect(states.every((state) => !state.active)).toBe(true);
    expect(plannerState.setSelectedTaskId).toHaveBeenCalledWith('task-1');
    expect(moveTask).not.toHaveBeenCalled();
  });
});
