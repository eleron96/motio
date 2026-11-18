import { describe, expect, it } from 'vitest';
import { Task } from '@/features/planner/types/planner';
import { calculateTaskLanes, getMaxLanes, type TaskWithLane } from '@/features/planner/lib/taskLanes';

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 'task-id',
  title: 'Task',
  projectId: null,
  assigneeIds: [],
  startDate: '2026-02-20',
  endDate: '2026-02-20',
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  ...overrides,
});

const byId = <T extends { id: string }>(rows: T[], id: string): T => rows.find((r) => r.id === id)!;

describe('calculateTaskLanes — lane assignment', () => {
  it('keeps non-overlapping tasks in the same lane', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-20', endDate: '2026-02-21' });
    const b = makeTask({ id: 'b', startDate: '2026-02-25', endDate: '2026-02-26' });
    const result = calculateTaskLanes([a, b]);
    expect(byId(result, 'a').lane).toBe(0);
    expect(byId(result, 'b').lane).toBe(0);
    expect(getMaxLanes(result)).toBe(1);
  });

  it('pushes overlapping tasks onto different lanes', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-20', endDate: '2026-02-25' });
    const b = makeTask({ id: 'b', startDate: '2026-02-22', endDate: '2026-02-27' });
    const result = calculateTaskLanes([a, b]);
    expect(byId(result, 'a').lane).toBe(0);
    expect(byId(result, 'b').lane).toBe(1);
    expect(getMaxLanes(result)).toBe(2);
  });

  it('copies the original task fields into the wrapper', () => {
    const a = makeTask({ id: 'a', title: 'Design', startDate: '2026-02-20', endDate: '2026-02-21' });
    const [wrapped] = calculateTaskLanes([a]);
    expect(wrapped.id).toBe('a');
    expect(wrapped.title).toBe('Design');
    expect(wrapped.lane).toBe(0);
  });

  it('returns an empty array for no tasks', () => {
    expect(calculateTaskLanes([])).toEqual([]);
  });
});

/** Empty places with a bar under them: what reads as a hole in the stack. */
const countHoles = (rows: TaskWithLane[]): number => {
  const days = new Set<string>();
  rows.forEach((row) => {
    for (let time = Date.parse(row.startDate); time <= Date.parse(row.endDate); time += 86_400_000) {
      days.add(new Date(time).toISOString().slice(0, 10));
    }
  });
  let holes = 0;
  days.forEach((day) => {
    const lanes = rows.filter((row) => row.startDate <= day && row.endDate >= day).map((row) => row.lane);
    holes += Math.max(...lanes) + 1 - lanes.length;
  });
  return holes;
};

describe('calculateTaskLanes — the longest bar first, like Tetris', () => {
  const day = (date: number) => `2026-11-${String(date).padStart(2, '0')}`;
  const span = (id: string, from: number, to: number, overrides: Partial<Task> = {}) => (
    makeTask({ id, startDate: day(from), endDate: day(to), ...overrides })
  );
  const lanesOfIds = (rows: TaskWithLane[], ids: string[]) => ids.map((id) => byId(rows, id).lane);

  it('puts a long task that starts on a busy day on top, not under the stack', () => {
    // The first screenshot: the long bar sat in lane 3 for days after the
    // one-day tasks of its first day were gone, with three empty lanes above it.
    const result = calculateTaskLanes([
      span('x1', 9, 9), span('x2', 9, 9), span('x3', 9, 9),
      span('long', 9, 13),
      span('a1', 12, 12), span('a2', 12, 12), span('a3', 12, 12),
      span('b1', 13, 13), span('c1', 14, 14),
    ]);

    expect(byId(result, 'long').lane).toBe(0);
    expect(lanesOfIds(result, ['x1', 'x2', 'x3'])).toEqual([1, 2, 3]);
    expect(lanesOfIds(result, ['a1', 'a2', 'a3', 'b1', 'c1'])).toEqual([1, 2, 3, 1, 0]);
    expect(countHoles(result)).toBe(0);
    expect(getMaxLanes(result)).toBe(4);
  });

  it('puts a long task on top even when shorter ones started before it', () => {
    const result = calculateTaskLanes([
      span('x1', 6, 9), span('x2', 6, 9), span('x3', 6, 9),
      span('long', 9, 13),
      span('a1', 12, 12), span('a2', 12, 12), span('a3', 12, 12),
      span('b1', 13, 13),
    ]);

    expect(byId(result, 'long').lane).toBe(0);
    expect(lanesOfIds(result, ['a1', 'a2', 'a3', 'b1'])).toEqual([1, 2, 3, 1]);
    expect(getMaxLanes(result)).toBe(4);
  });

  it('lets one-day tasks fill the room under the longer ones', () => {
    // The second screenshot: a two-day task hung in lane 5 under a long bar
    // that had already ended, with two empty lanes above it on its second day.
    const result = calculateTaskLanes([
      span('y1', 9, 9), span('y2', 9, 9), span('y3', 9, 9), span('y4', 9, 9),
      span('long', 9, 12),
      span('a1', 12, 12), span('a2', 12, 12), span('a3', 12, 12), span('a4', 12, 12),
      span('two', 12, 13),
      span('b1', 13, 13), span('b2', 13, 13), span('b3', 13, 13),
      span('c1', 14, 14), span('c2', 14, 14), span('c3', 14, 14),
    ]);

    expect(lanesOfIds(result, ['long', 'two'])).toEqual([0, 1]);
    expect(lanesOfIds(result, ['a1', 'a2', 'a3', 'a4'])).toEqual([2, 3, 4, 5]);
    expect(lanesOfIds(result, ['b1', 'b2', 'b3'])).toEqual([0, 2, 3]);
    expect(lanesOfIds(result, ['c1', 'c2', 'c3'])).toEqual([0, 1, 2]);
    expect(countHoles(result)).toBe(0);
    expect(getMaxLanes(result)).toBe(6);
  });

  it('puts the task with a priority above one of the same length', () => {
    const plain = span('plain', 9, 10);
    const urgent = span('urgent', 9, 10, { priority: 'low' });

    [[plain, urgent], [urgent, plain]].forEach((order) => {
      const result = calculateTaskLanes(order);
      expect(lanesOfIds(result, ['urgent', 'plain'])).toEqual([0, 1]);
    });
  });

  it('orders priorities high, medium, low, none', () => {
    const result = calculateTaskLanes([
      span('none', 9, 9),
      span('low', 9, 9, { priority: 'low' }),
      span('high', 9, 9, { priority: 'high' }),
      span('medium', 9, 9, { priority: 'medium' }),
    ]);

    expect(lanesOfIds(result, ['high', 'medium', 'low', 'none'])).toEqual([0, 1, 2, 3]);
  });

  it('lets the length decide before the priority', () => {
    const result = calculateTaskLanes([
      span('urgent', 9, 9, { priority: 'high' }),
      span('longer', 9, 10),
    ]);

    expect(lanesOfIds(result, ['longer', 'urgent'])).toEqual([0, 1]);
  });

  it('puts the earlier of two equal tasks first', () => {
    const result = calculateTaskLanes([span('later', 10, 11), span('earlier', 9, 10)]);

    expect(lanesOfIds(result, ['earlier', 'later'])).toEqual([0, 1]);
  });

  it('returns the bars by start, then by end, whatever order they were placed in', () => {
    const result = calculateTaskLanes([span('c', 10, 10), span('b', 9, 13), span('a', 9, 9)]);

    expect(result.map((task) => task.id)).toEqual(['a', 'b', 'c']);
  });

  it('packs the row by start when the longest-first order would make it taller', () => {
    // Longest first: "a" and "d" take lane 0, "b" lane 1, and "c" touches all
    // three — a third lane on a row whose busiest day has two tasks.
    const result = calculateTaskLanes([span('a', 7, 11), span('b', 3, 6), span('c', 6, 9), span('d', 1, 4)]);

    expect(getMaxLanes(result)).toBe(2);
    expect(lanesOfIds(result, ['d', 'b', 'c', 'a'])).toEqual([0, 1, 0, 1]);
  });

  it('packs the row by start when that leaves fewer holes', () => {
    // A few long bars following one another. Longest first, "c" and "b" take
    // lanes 0 and 1 and "a" hangs in lane 1 for eight days with nothing above.
    const result = calculateTaskLanes([
      span('a', 1, 9), span('b', 11, 23), span('c', 9, 21), span('d', 11, 19), span('e', 13, 19),
    ]);

    expect(lanesOfIds(result, ['a', 'c', 'b', 'd', 'e'])).toEqual([0, 1, 0, 2, 3]);
    expect(countHoles(result)).toBe(1);
  });

  it('never lays a row out worse than the order used before: by start, the shorter first', () => {
    let seed = 5;
    const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const dayAt = (offset: number) => new Date(Date.UTC(2026, 1, 1 + offset)).toISOString().slice(0, 10);
    const packedAsBefore = (tasks: Task[]): TaskWithLane[] => {
      const placed: TaskWithLane[] = [];
      [...tasks]
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate))
        .forEach((task) => {
          let lane = 0;
          const taken = (bar: TaskWithLane) => bar.lane === lane && bar.startDate <= task.endDate && task.startDate <= bar.endDate;
          while (placed.some(taken)) lane += 1;
          placed.push({ ...task, lane });
        });
      return placed;
    };
    // From rows of many one-day tasks to rows of a few long bars.
    const mixes = [{ perDay: 3, oneDay: 0.65, longest: 12 }, { perDay: 1, oneDay: 0.2, longest: 25 }, { perDay: 0.2, oneDay: 0.1, longest: 30 }];
    mixes.forEach((mix) => {
      for (let round = 0; round < 40; round += 1) {
        const tasks: Task[] = [];
        for (let offset = 0; offset < 40; offset += 1) {
          const count = Math.floor(random() * (mix.perDay * 2 + 1));
          for (let index = 0; index < count; index += 1) {
            const length = random() < mix.oneDay ? 0 : 1 + Math.floor(random() * mix.longest);
            tasks.push(makeTask({ id: `t${offset}-${index}`, startDate: dayAt(offset), endDate: dayAt(offset + length) }));
          }
        }
        if (tasks.length === 0) continue;
        const result = calculateTaskLanes(tasks);
        const before = packedAsBefore(tasks);

        expect(getMaxLanes(result)).toBeLessThanOrEqual(getMaxLanes(before));
        expect(countHoles(result)).toBeLessThanOrEqual(countHoles(before));
      }
    });
  });

  it('is never taller than the busiest day and leaves no bar that could rise', () => {
    let seed = 23;
    const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const dayAt = (offset: number) => new Date(Date.UTC(2026, 1, 1 + offset)).toISOString().slice(0, 10);
    const priorities = [null, null, null, 'low', 'medium', 'high'] as const;
    for (let round = 0; round < 60; round += 1) {
      const tasks = Array.from({ length: 40 }, (_, index) => {
        const start = Math.floor(random() * 30);
        const length = random() < 0.6 ? 0 : Math.floor(random() * 12);
        return makeTask({
          id: `t${index}`,
          startDate: dayAt(start),
          endDate: dayAt(start + length),
          priority: priorities[Math.floor(random() * priorities.length)],
        });
      });
      const result = calculateTaskLanes(tasks);

      const busiestDay = Math.max(...Array.from({ length: 45 }, (_, offset) => (
        tasks.filter((task) => task.startDate <= dayAt(offset) && task.endDate >= dayAt(offset)).length
      )));
      expect(getMaxLanes(result)).toBe(busiestDay);

      result.forEach((bar) => {
        for (let lane = 0; lane < bar.lane; lane += 1) {
          const blocked = result.some((other) => (
            other.lane === lane && other.startDate <= bar.endDate && bar.startDate <= other.endDate
          ));
          expect(blocked, `${bar.id} could rise to lane ${lane}`).toBe(true);
        }
      });
    }
  });
});

describe('calculateTaskLanes — lane 0 reserved for a time-off bar', () => {
  // The vacation in the screenshot that started this: Aug 10-23.
  const vacation = [{ startDate: '2026-08-10', endDate: '2026-08-23' }];

  it('leaves lane 0 to tasks that end before the period', () => {
    const before = makeTask({ id: 'before', startDate: '2026-08-01', endDate: '2026-08-05' });
    const result = calculateTaskLanes([before], vacation);
    expect(byId(result, 'before').lane).toBe(0);
  });

  it('leaves lane 0 to tasks that start after the period', () => {
    const after = makeTask({ id: 'after', startDate: '2026-08-25', endDate: '2026-08-28' });
    const result = calculateTaskLanes([after], vacation);
    expect(byId(result, 'after').lane).toBe(0);
  });

  it('keeps lane 0 on both sides while pushing only the overlapping task down', () => {
    const before = makeTask({ id: 'before', startDate: '2026-08-01', endDate: '2026-08-05' });
    const during = makeTask({ id: 'during', startDate: '2026-08-12', endDate: '2026-08-14' });
    const after = makeTask({ id: 'after', startDate: '2026-08-25', endDate: '2026-08-28' });

    const result = calculateTaskLanes([before, during, after], vacation);

    expect(byId(result, 'before').lane).toBe(0);
    expect(byId(result, 'during').lane).toBe(1);
    expect(byId(result, 'after').lane).toBe(0);
    expect(getMaxLanes(result)).toBe(2);
  });

  it('pushes a task that merely touches the edge of the period', () => {
    const touchesStart = makeTask({ id: 'touches', startDate: '2026-08-05', endDate: '2026-08-10' });
    const result = calculateTaskLanes([touchesStart], vacation);
    expect(byId(result, 'touches').lane).toBe(1);
  });

  it('pushes a task that spans the whole period', () => {
    const spans = makeTask({ id: 'spans', startDate: '2026-07-01', endDate: '2026-09-30' });
    const result = calculateTaskLanes([spans], vacation);
    expect(byId(result, 'spans').lane).toBe(1);
  });

  it('never lets two overlapping tasks share a lane once one is pushed down', () => {
    // Both overlap the vacation AND each other, so they need lanes 1 and 2.
    const first = makeTask({ id: 'first', startDate: '2026-08-11', endDate: '2026-08-20' });
    const second = makeTask({ id: 'second', startDate: '2026-08-15', endDate: '2026-08-22' });

    const result = calculateTaskLanes([first, second], vacation);

    expect(byId(result, 'first').lane).toBe(1);
    expect(byId(result, 'second').lane).toBe(2);
  });

  it('handles two separate periods in one row', () => {
    const periods = [
      { startDate: '2026-08-10', endDate: '2026-08-12' },
      { startDate: '2026-09-01', endDate: '2026-09-03' },
    ];
    const between = makeTask({ id: 'between', startDate: '2026-08-20', endDate: '2026-08-25' });
    const inSecond = makeTask({ id: 'in-second', startDate: '2026-09-02', endDate: '2026-09-02' });

    const result = calculateTaskLanes([between, inSecond], periods);

    expect(byId(result, 'between').lane).toBe(0);
    expect(byId(result, 'in-second').lane).toBe(1);
  });

  it('packs exactly as before when no period is reserved', () => {
    const a = makeTask({ id: 'a', startDate: '2026-08-12', endDate: '2026-08-14' });
    const b = makeTask({ id: 'b', startDate: '2026-08-13', endDate: '2026-08-15' });

    expect(calculateTaskLanes([a, b])).toEqual(calculateTaskLanes([a, b], []));
    expect(byId(calculateTaskLanes([a, b], []), 'a').lane).toBe(0);
  });
});

describe('calculateTaskLanes — referential identity (memo stability)', () => {
  it('returns the same wrapper reference when the task objects are unchanged', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-20', endDate: '2026-02-21' });
    const b = makeTask({ id: 'b', startDate: '2026-02-25', endDate: '2026-02-26' });

    const first = calculateTaskLanes([a, b]);
    const second = calculateTaskLanes([a, b]);

    // Same task refs + same lanes ⇒ identical wrappers, so TaskBar's
    // `prev.task === next.task` comparator bails out and skips the re-render.
    expect(byId(second, 'a')).toBe(byId(first, 'a'));
    expect(byId(second, 'b')).toBe(byId(first, 'b'));
  });

  it('re-wraps only the task whose object was replaced', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-20', endDate: '2026-02-21' });
    const b = makeTask({ id: 'b', startDate: '2026-02-25', endDate: '2026-02-26' });
    const first = calculateTaskLanes([a, b]);

    // Simulate an immutable store update to `a` only (e.g. a drag) — new object ref.
    const aMoved = makeTask({ id: 'a', startDate: '2026-02-22', endDate: '2026-02-23' });
    const second = calculateTaskLanes([aMoved, b]);

    expect(byId(second, 'a')).not.toBe(byId(first, 'a')); // moved bar re-renders
    expect(byId(second, 'b')).toBe(byId(first, 'b'));      // untouched bar is skipped
  });

  it('produces a distinct wrapper when the same task lands on a different lane', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-20', endDate: '2026-02-25' });

    // Alone: lane 0.
    const solo = calculateTaskLanes([a]);
    expect(byId(solo, 'a').lane).toBe(0);

    // With an overlapping earlier task, `a` is pushed to lane 1 — a different wrapper,
    // still carrying the correct lane (cache keys by lane, no stale reuse).
    const earlier = makeTask({ id: 'z', startDate: '2026-02-19', endDate: '2026-02-26' });
    const withNeighbour = calculateTaskLanes([earlier, a]);
    const aOnLane1 = byId(withNeighbour, 'a');
    expect(aOnLane1.lane).toBe(1);
    expect(aOnLane1).not.toBe(byId(solo, 'a'));
    // ...and the lane-0 wrapper is still returned when `a` is alone again.
    expect(byId(calculateTaskLanes([a]), 'a')).toBe(byId(solo, 'a'));
  });
});

describe('calculateTaskLanes — keeping lanes from the last layout', () => {
  const lanesOf = (rows: TaskWithLane[]) => new Map(rows.map((row) => [row.id, row]));
  const overlapsInLane = (rows: Array<Task & { lane: number }>) => rows.some((left, i) => rows.some((right, j) => (
    i < j && left.lane === right.lane && left.startDate <= right.endDate && right.startDate <= left.endDate
  )));

  it('keeps every lane when an earlier task leaves (the window moved right)', () => {
    const early = makeTask({ id: 'early', startDate: '2026-02-01', endDate: '2026-02-20' });
    const a = makeTask({ id: 'a', startDate: '2026-02-05', endDate: '2026-02-12' });
    const b = makeTask({ id: 'b', startDate: '2026-02-13', endDate: '2026-02-25' });
    const before = calculateTaskLanes([early, a, b]);
    expect(['early', 'a', 'b'].map((id) => byId(before, id).lane)).toEqual([0, 1, 1]);
    // Packed from scratch without "early", both would rise to lane 0.
    expect(calculateTaskLanes([a, b]).map((task) => task.lane)).toEqual([0, 0]);

    const after = calculateTaskLanes([a, b], [], lanesOf(before));

    ['a', 'b'].forEach((id) => expect(byId(after, id).lane, id).toBe(1));
    expect(overlapsInLane(after)).toBe(false);
  });

  it('places tasks that arrive in free lanes without moving the ones on screen', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-10', endDate: '2026-02-15' });
    const b = makeTask({ id: 'b', startDate: '2026-02-12', endDate: '2026-02-18' });
    const before = calculateTaskLanes([a, b]);
    // An earlier task overlapping both: packed from scratch it would take lane 0.
    const arrived = makeTask({ id: 'arrived', startDate: '2026-02-01', endDate: '2026-02-13' });

    const after = calculateTaskLanes([arrived, a, b], [], lanesOf(before));

    expect(byId(after, 'a').lane).toBe(byId(before, 'a').lane);
    expect(byId(after, 'b').lane).toBe(byId(before, 'b').lane);
    expect(byId(after, 'arrived').lane).toBe(2);
    expect(overlapsInLane(after)).toBe(false);
  });

  it('moves only the task whose lane got taken, to the first free lane', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-10', endDate: '2026-02-12' });
    const b = makeTask({ id: 'b', startDate: '2026-02-20', endDate: '2026-02-22' });
    const before = calculateTaskLanes([a, b]);
    expect(byId(before, 'b').lane).toBe(0);
    // b was dragged onto a's days.
    const moved = makeTask({ id: 'b', startDate: '2026-02-11', endDate: '2026-02-13' });

    const after = calculateTaskLanes([a, moved], [], lanesOf(before));

    expect(byId(after, 'a').lane).toBe(0);
    expect(byId(after, 'b').lane).toBe(1);
  });

  it('places a task dragged to the next day in the first free lane of that day', () => {
    // 10 Feb is busy, 11 Feb has one task: the bar dropped on 11 Feb must not
    // hang in lane 3 with lanes 1-2 free above it.
    const a = makeTask({ id: 'a', startDate: '2026-02-10', endDate: '2026-02-10' });
    const b = makeTask({ id: 'b', startDate: '2026-02-10', endDate: '2026-02-10' });
    const c = makeTask({ id: 'c', startDate: '2026-02-10', endDate: '2026-02-10' });
    const dragged = makeTask({ id: 'dragged', startDate: '2026-02-10', endDate: '2026-02-10' });
    const next = makeTask({ id: 'next', startDate: '2026-02-11', endDate: '2026-02-11' });
    const before = calculateTaskLanes([a, b, c, dragged, next]);
    expect(byId(before, 'dragged').lane).toBe(3);
    expect(byId(before, 'next').lane).toBe(0);

    const dropped = makeTask({ id: 'dragged', startDate: '2026-02-11', endDate: '2026-02-11' });
    const after = calculateTaskLanes([a, b, c, dropped, next], [], lanesOf(before));

    expect(byId(after, 'dragged').lane).toBe(1);
    ['a', 'b', 'c', 'next'].forEach((id) => expect(byId(after, id).lane, id).toBe(byId(before, id).lane));
  });

  /**
   * The place a moved bar leaves is filled: the bars under it on its days rise,
   * each freeing its own place for the next. Before, they stayed put and the
   * stack had a hole where the moved bar had been.
   */
  it('fills the place a dragged task left: the bars under it rise', () => {
    const stack = ['a', 'b', 'c', 'd'].map((id) => makeTask({ id, startDate: '2026-02-10', endDate: '2026-02-10' }));
    const before = calculateTaskLanes(stack);
    expect(stack.map((task) => byId(before, task.id).lane)).toEqual([0, 1, 2, 3]);

    const dragged = { ...stack[1], startDate: '2026-02-12', endDate: '2026-02-12' };
    const after = calculateTaskLanes([stack[0], dragged, stack[2], stack[3]], [], lanesOf(before));

    expect(['a', 'c', 'd'].map((id) => byId(after, id).lane)).toEqual([0, 1, 2]);
    expect(byId(after, 'b').lane).toBe(0);
  });

  it('raises a longer bar only as far as all of its days are free', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-10', endDate: '2026-02-10' });
    const moved = makeTask({ id: 'moved', startDate: '2026-02-10', endDate: '2026-02-10' });
    const blocker = makeTask({ id: 'blocker', startDate: '2026-02-11', endDate: '2026-02-11' });
    const long = makeTask({ id: 'long', startDate: '2026-02-10', endDate: '2026-02-11' });
    const previous = new Map([
      ['a', { lane: 0, startDate: a.startDate, endDate: a.endDate }],
      ['moved', { lane: 1, startDate: moved.startDate, endDate: moved.endDate }],
      ['blocker', { lane: 1, startDate: blocker.startDate, endDate: blocker.endDate }],
      ['long', { lane: 2, startDate: long.startDate, endDate: long.endDate }],
    ]);

    const after = calculateTaskLanes([a, { ...moved, startDate: '2026-02-20', endDate: '2026-02-20' }, blocker, long], [], previous);

    // Lane 1 is free on the 10th but taken on the 11th: the long bar stays.
    expect(byId(after, 'long').lane).toBe(2);
    expect(byId(after, 'blocker').lane).toBe(1);
  });

  it('lets the bars under a task deleted on screen rise', () => {
    const stack = ['a', 'b', 'c'].map((id) => makeTask({ id, startDate: '2026-02-10', endDate: '2026-02-10' }));
    const before = calculateTaskLanes(stack);

    const after = calculateTaskLanes([stack[0], stack[2]], [], lanesOf(before), {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });

    expect(byId(after, 'c').lane).toBe(1);
  });

  it('moves nothing when a task only scrolled out of the laid out days', () => {
    const early = makeTask({ id: 'early', startDate: '2026-02-01', endDate: '2026-02-10' });
    const a = makeTask({ id: 'a', startDate: '2026-02-05', endDate: '2026-02-14' });
    const before = calculateTaskLanes([early, a]);
    expect(byId(before, 'a').lane).toBe(1);

    const after = calculateTaskLanes([a], [], lanesOf(before), { startDate: '2026-02-11', endDate: '2026-03-10' });

    expect(byId(after, 'a').lane).toBe(1);
  });

  it('places a resized task anew too: its days changed', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-10', endDate: '2026-02-10' });
    const resized = makeTask({ id: 'resized', startDate: '2026-02-11', endDate: '2026-02-11' });
    // The last layout had it in lane 2 (lanes above were taken then).
    const previous = new Map([
      ['a', { lane: 0, startDate: a.startDate, endDate: a.endDate }],
      ['resized', { lane: 2, startDate: resized.startDate, endDate: resized.endDate }],
    ]);

    const after = calculateTaskLanes([a, { ...resized, endDate: '2026-02-12' }], [], previous);

    expect(byId(after, 'resized').lane).toBe(0);
  });

  it('does not lift a bar whose days stayed, even when its task changed otherwise', () => {
    // Scrolling and edits that keep the dates (a title, a status) never move a
    // bar, though a lane above it is free now.
    const kept = makeTask({ id: 'kept', startDate: '2026-02-10', endDate: '2026-02-12' });
    const previous = new Map([['kept', { lane: 2, startDate: kept.startDate, endDate: kept.endDate }]]);

    const after = calculateTaskLanes([{ ...kept, title: 'Renamed' }], [], previous);

    expect(byId(after, 'kept').lane).toBe(2);
  });

  it('places the tasks that arrive longest first, around the bars already laid out', () => {
    const kept = makeTask({ id: 'kept', startDate: '2026-02-20', endDate: '2026-02-20' });
    const previous = new Map([['kept', { lane: 0, startDate: kept.startDate, endDate: kept.endDate }]]);
    const short = makeTask({ id: 'short', startDate: '2026-02-10', endDate: '2026-02-10' });
    const long = makeTask({ id: 'long', startDate: '2026-02-10', endDate: '2026-02-14' });
    const urgent = makeTask({ id: 'urgent', startDate: '2026-02-10', endDate: '2026-02-10', priority: 'high' });

    const after = calculateTaskLanes([short, urgent, long, kept], [], previous);

    expect(['long', 'urgent', 'short'].map((id) => byId(after, id).lane)).toEqual([0, 1, 2]);
    expect(byId(after, 'kept').lane).toBe(0);
  });

  it('does not move a bar when only its priority changed', () => {
    const top = makeTask({ id: 'top', startDate: '2026-02-10', endDate: '2026-02-10' });
    const bottom = makeTask({ id: 'bottom', startDate: '2026-02-10', endDate: '2026-02-10' });
    const before = calculateTaskLanes([top, bottom]);
    expect(byId(before, 'bottom').lane).toBe(1);

    const after = calculateTaskLanes([top, { ...bottom, priority: 'high' }], [], lanesOf(before));

    expect(byId(after, 'top').lane).toBe(0);
    expect(byId(after, 'bottom').lane).toBe(1);
    // Laid out afresh (the page reopened, the filters changed) it goes on top.
    expect(byId(calculateTaskLanes([top, { ...bottom, priority: 'high' }]), 'bottom').lane).toBe(0);
  });

  it('keeps a task out of lane 0 where a time-off bar holds it', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-10', endDate: '2026-02-12' });
    const after = calculateTaskLanes(
      [a],
      [{ startDate: '2026-02-11', endDate: '2026-02-11' }],
      new Map([['a', { lane: 0, startDate: a.startDate, endDate: a.endDate }]]),
    );
    expect(byId(after, 'a').lane).toBe(1);
  });

  it('never stacks two overlapping tasks in one lane, whatever the last layout said', () => {
    let seed = 11;
    const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const day = (offset: number) => new Date(Date.UTC(2026, 1, 1 + offset)).toISOString().slice(0, 10);
    for (let round = 0; round < 50; round += 1) {
      const tasks = Array.from({ length: 30 }, (_, index) => {
        const start = Math.floor(random() * 40);
        return makeTask({ id: `t${index}`, startDate: day(start), endDate: day(start + Math.floor(random() * 6)) });
      });
      const previous = new Map(tasks.map((task) => [
        task.id,
        { lane: Math.floor(random() * 5), startDate: task.startDate, endDate: task.endDate },
      ]));
      const result = calculateTaskLanes(tasks, [], previous);
      expect(result).toHaveLength(tasks.length);
      expect(overlapsInLane(result)).toBe(false);

      // Then some are dragged and some deleted: filling their places must not
      // stack two tasks in a lane either.
      const changed = tasks
        .filter(() => random() > 0.2)
        .map((task) => (random() > 0.7 ? { ...task, startDate: day(41), endDate: day(42) } : task));
      const refilled = calculateTaskLanes(changed, [], lanesOf(result), { startDate: day(0), endDate: day(50) });
      expect(refilled).toHaveLength(changed.length);
      expect(overlapsInLane(refilled)).toBe(false);
    }
  });
});

