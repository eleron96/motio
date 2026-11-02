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
 * the rendered range; neither may reshuffle the bars on screen. Row heights
 * follow the days on screen (useAdaptiveRowHeights), not the busiest day of
 * the rendered range.
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

type Props = { tasks: Task[]; visibleDays: Date[]; scrollLeft?: number; viewportWidth?: number };

// Stable like the store's arrays: a fresh array per render would redo every layout memo.
const people = [person];
const noProjects: never[] = [];
const noGroups = new Map<string, string>();

const renderRows = (initial: Props) => renderHook((props: Props) => useTaskDisplayRows({
  tasks: props.tasks,
  filters: initialFilters,
  assignees: people,
  activeFilteredAssignees: people,
  projects: noProjects,
  groupMode: 'assignee',
  myAssigneeId: null,
  assigneeGroupMap: noGroups,
  visibleDays: props.visibleDays,
  dayWidth: 40,
  canEdit: false,
  sidebarViewportWidth: 240,
  layoutScope: 'ws-1|day',
  scrollLeft: props.scrollLeft,
  viewportWidth: props.viewportWidth,
}), { initialProps: initial });

const rowOf = (result: { current: ReturnType<typeof useTaskDisplayRows> }) => (
  result.current.displayRows.find((row) => row.id === person.id)!
);
const heightOf = (result: { current: ReturnType<typeof useTaskDisplayRows> }) => (
  result.current.rowHeights[person.id]
);
const laneOf = (result: { current: ReturnType<typeof useTaskDisplayRows> }, id: string) => (
  rowOf(result).tasks.find((item) => item.id === id)?.lane
);

describe('useTaskDisplayRows layout while scrolling', () => {
  const march = days('2026-03-01', 31);

  it('ignores tasks loaded outside the rendered days', () => {
    const onScreen = [task('a', '2026-03-10', '2026-03-12')];
    const { result, rerender } = renderRows({ tasks: onScreen, visibleDays: march });
    const height = heightOf(result);

    // The next window brings a pile of overlapping tasks in May.
    const may = Array.from({ length: 4 }, (_, index) => task(`may-${index}`, '2026-05-10', '2026-05-12'));
    rerender({ tasks: [...onScreen, ...may], visibleDays: march });

    expect(heightOf(result)).toBe(height);
    expect(rowOf(result).tasks.map((item) => item.id)).toEqual(['a']);
  });

  it('keeps the lanes of the bars on screen when earlier tasks leave the window', () => {
    const early = task('early', '2026-02-25', '2026-03-05');
    const a = task('a', '2026-03-03', '2026-03-08');
    const b = task('b', '2026-03-06', '2026-03-10');
    const { result, rerender } = renderRows({ tasks: [early, a, b], visibleDays: march });
    const lanes = { a: laneOf(result, 'a'), b: laneOf(result, 'b') };

    rerender({ tasks: [a, b], visibleDays: march });

    expect({ a: laneOf(result, 'a'), b: laneOf(result, 'b') }).toEqual(lanes);
  });

  it('fits the row to the days on screen, not to the busiest day rendered', () => {
    const busy = Array.from({ length: 3 }, (_, index) => task(`busy-${index}`, '2026-03-05', '2026-03-06'));
    const later = task('later', '2026-03-25', '2026-03-26');
    // 10 days on screen (40 px each) plus a 3-day margin on each side.
    const { result, rerender } = renderRows({ tasks: [...busy, later], visibleDays: march, scrollLeft: 0, viewportWidth: 400 });
    const tallHeight = heightOf(result);
    const busyLanes = { a: laneOf(result, 'busy-1'), b: laneOf(result, 'busy-2') };

    rerender({ tasks: [...busy, later], visibleDays: march, scrollLeft: 20 * 40, viewportWidth: 400 });

    expect(heightOf(result)).toBeLessThan(tallHeight);
    // The bars keep their lanes: only the row height follows the screen.
    expect({ a: laneOf(result, 'busy-1'), b: laneOf(result, 'busy-2') }).toEqual(busyLanes);

    rerender({ tasks: [...busy, later], visibleDays: march, scrollLeft: 0, viewportWidth: 400 });

    expect(heightOf(result)).toBe(tallHeight);
  });

  it('keeps the row object and its bars while only the scroll moves', () => {
    const onScreen = [task('a', '2026-03-10', '2026-03-12')];
    const { result, rerender } = renderRows({ tasks: onScreen, visibleDays: march, scrollLeft: 0, viewportWidth: 400 });
    const row = rowOf(result);
    const elements = result.current.rowTaskElementsById.get(person.id);

    rerender({ tasks: onScreen, visibleDays: march, scrollLeft: 40, viewportWidth: 400 });

    expect(rowOf(result)).toBe(row);
    expect(result.current.rowTaskElementsById.get(person.id)).toBe(elements);
  });
});
