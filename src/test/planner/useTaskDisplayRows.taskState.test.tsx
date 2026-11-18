import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { addDays, eachDayOfInterval, parseISO } from 'date-fns';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) => (
    strings.reduce((acc, str, index) => acc + str + (values[index] ?? ''), '')
  ),
}));

import { useTaskDisplayRows } from '@/features/planner/components/timeline/hooks/useTaskDisplayRows';
import { initialFilters } from '@/features/planner/store/plannerStore.helpers';
import type { Assignee, Status, Task } from '@/features/planner/types/planner';

/**
 * Open tasks are laid out above done ones and done above cancelled; closing a
 * task on screen moves no bar, and neither does a reload of the statuses.
 */

const person: Assignee = { id: 'person-1', name: 'Anna', isActive: true, email: null, phone: null };

const status = (id: string, name: string, isFinal = false, isCancelled = false): Status => (
  { id, name, emoji: null, color: '#94a3b8', isFinal, isCancelled }
);
const makeStatuses = () => [status('open', 'In progress'), status('done', 'Done', true), status('cancelled', 'Cancelled', true, true)];

const task = (id: string, statusId: string): Task => ({
  id,
  title: id,
  projectId: null,
  assigneeIds: [person.id],
  startDate: '2026-03-10',
  endDate: '2026-03-10',
  statusId,
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
});

const march = eachDayOfInterval({ start: parseISO('2026-03-01'), end: addDays(parseISO('2026-03-01'), 30) });

// The same objects on every render: only the tasks and the statuses change.
const people = [person];
const noProjects: never[] = [];
const noGroups = new Map<string, string>();

type Props = { tasks: Task[]; statuses: Status[] };

const renderRows = (initial: Props) => renderHook((props: Props) => useTaskDisplayRows({
  tasks: props.tasks,
  statuses: props.statuses,
  filters: initialFilters,
  assignees: people,
  activeFilteredAssignees: people,
  projects: noProjects,
  groupMode: 'assignee',
  myAssigneeId: null,
  assigneeGroupMap: noGroups,
  visibleDays: march,
  dayWidth: 40,
  canEdit: false,
  sidebarViewportWidth: 240,
  layoutScope: 'ws-1|day',
}), { initialProps: initial });

const rowOf = (result: { current: ReturnType<typeof useTaskDisplayRows> }) => (
  result.current.displayRows.find((row) => row.id === person.id)!
);
const lanesOf = (result: { current: ReturnType<typeof useTaskDisplayRows> }, ids: string[]) => (
  ids.map((id) => rowOf(result).tasks.find((item) => item.id === id)?.lane)
);

describe('useTaskDisplayRows and the state of a task', () => {
  it('lays the tasks of a day out open, done, cancelled', () => {
    const { result } = renderRows({
      tasks: [task('cancelled', 'cancelled'), task('done', 'done'), task('open', 'open')],
      statuses: makeStatuses(),
    });

    expect(lanesOf(result, ['open', 'done', 'cancelled'])).toEqual([0, 1, 2]);
  });

  it('does not move a bar when its task is closed on screen', () => {
    const first = task('first', 'open');
    const second = task('second', 'open');
    const statuses = makeStatuses();
    const { result, rerender } = renderRows({ tasks: [first, second], statuses });
    expect(lanesOf(result, ['first', 'second'])).toEqual([0, 1]);

    rerender({ tasks: [{ ...first, statusId: 'cancelled' }, second], statuses });

    expect(lanesOf(result, ['first', 'second'])).toEqual([0, 1]);
  });

  it('does not redo the layout when the statuses are reloaded or renamed', () => {
    const tasks = [task('open', 'open'), task('done', 'done')];
    const { result, rerender } = renderRows({ tasks, statuses: makeStatuses() });
    const bars = rowOf(result).tasks;

    rerender({ tasks, statuses: makeStatuses().map((item) => ({ ...item, name: `${item.name}!` })) });

    expect(rowOf(result).tasks).toBe(bars);
  });
});
