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
import type { Assignee, Task } from '@/features/planner/types/planner';

/**
 * Scrolling the timeline far loads the next stretch of dates and re-anchors
 * the rendered range; neither may reshuffle the bars on screen or make the
 * rows jump.
 */

const person: Assignee = { id: 'person-1', name: 'Anna', isActive: true, email: null, phone: null };

const task = (id: string, startDate: string, endDate: string): Task => ({
  id,
  title: id,
  projectId: null,
  assigneeIds: [person.id],
  startDate,
  endDate,
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
});

const days = (from: string, count: number) => eachDayOfInterval({ start: parseISO(from), end: addDays(parseISO(from), count - 1) });

type Props = { tasks: Task[]; visibleDays: Date[] };

const renderRows = (initial: Props) => renderHook((props: Props) => useTaskDisplayRows({
  tasks: props.tasks,
  filters: initialFilters,
  assignees: [person],
  activeFilteredAssignees: [person],
  projects: [],
  groupMode: 'assignee',
  myAssigneeId: null,
  assigneeGroupMap: new Map(),
  visibleDays: props.visibleDays,
  dayWidth: 40,
  canEdit: false,
  sidebarViewportWidth: 240,
  layoutScope: 'ws-1|day',
}), { initialProps: initial });

const rowOf = (result: { current: ReturnType<typeof useTaskDisplayRows> }) => (
  result.current.displayRows.find((row) => row.id === person.id)!
);
const laneOf = (result: { current: ReturnType<typeof useTaskDisplayRows> }, id: string) => (
  rowOf(result).tasks.find((item) => item.id === id)?.lane
);

describe('useTaskDisplayRows layout while scrolling', () => {
  const march = days('2026-03-01', 31);

  it('ignores tasks loaded outside the rendered days', () => {
    const onScreen = [task('a', '2026-03-10', '2026-03-12')];
    const { result, rerender } = renderRows({ tasks: onScreen, visibleDays: march });
    const height = rowOf(result).height;

    // The next window brings a pile of overlapping tasks in May.
    const may = Array.from({ length: 4 }, (_, index) => task(`may-${index}`, '2026-05-10', '2026-05-12'));
    rerender({ tasks: [...onScreen, ...may], visibleDays: march });

    expect(rowOf(result).height).toBe(height);
    expect(rowOf(result).tasks.map((item) => item.id)).toEqual(['a']);
  });

  it('keeps the lanes of the bars on screen when earlier tasks leave the window', () => {
    const early = task('early', '2026-02-25', '2026-03-05');
    const a = task('a', '2026-03-03', '2026-03-08');
    const b = task('b', '2026-03-06', '2026-03-10');
    const { result, rerender } = renderRows({ tasks: [early, a, b], visibleDays: march });
    const lanes = { a: laneOf(result, 'a'), b: laneOf(result, 'b') };

    // Scrolled on: the rendered days now start after "early" ends.
    rerender({ tasks: [a, b], visibleDays: days('2026-03-06', 31) });

    expect({ a: laneOf(result, 'a'), b: laneOf(result, 'b') }).toEqual(lanes);
  });

  it('fills the hole a dragged task leaves in the stack', () => {
    const stack = ['a', 'b', 'c', 'd'].map((id) => task(id, '2026-03-10', '2026-03-10'));
    const { result, rerender } = renderRows({ tasks: stack, visibleDays: march });

    rerender({ tasks: [stack[0], { ...stack[1], startDate: '2026-03-12', endDate: '2026-03-12' }, stack[2], stack[3]], visibleDays: march });

    expect(['a', 'c', 'd', 'b'].map((id) => laneOf(result, id))).toEqual([0, 1, 2, 0]);
  });

  it('puts a task dragged to the next day in the top free lane of that day', () => {
    const busy = ['a', 'b', 'c'].map((id) => task(id, '2026-03-10', '2026-03-10'));
    const dragged = task('dragged', '2026-03-10', '2026-03-10');
    const next = task('next', '2026-03-11', '2026-03-11');
    const { result, rerender } = renderRows({ tasks: [...busy, dragged, next], visibleDays: march });
    expect(laneOf(result, 'dragged')).toBe(3);

    rerender({ tasks: [...busy, { ...dragged, startDate: '2026-03-11', endDate: '2026-03-11' }, next], visibleDays: march });

    expect(laneOf(result, 'dragged')).toBe(1);
    expect(['a', 'b', 'c', 'next'].map((id) => laneOf(result, id))).toEqual([0, 1, 2, 0]);
  });

  it('does not shrink a row when a busy stretch scrolls out of the rendered days', () => {
    const busy = Array.from({ length: 3 }, (_, index) => task(`busy-${index}`, '2026-03-05', '2026-03-06'));
    const later = task('later', '2026-04-10', '2026-04-11');
    const { result, rerender } = renderRows({ tasks: [...busy, later], visibleDays: march });
    const tallHeight = rowOf(result).height;

    rerender({ tasks: [...busy, later], visibleDays: days('2026-04-01', 30) });

    expect(rowOf(result).height).toBe(tallHeight);
  });
});
