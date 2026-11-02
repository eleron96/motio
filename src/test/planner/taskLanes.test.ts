import { describe, expect, it } from 'vitest';
import { Task } from '@/features/planner/types/planner';
import { calculateTaskLanes, getMaxLanes } from '@/features/planner/lib/taskLanes';

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
  const lanesOf = (rows: Array<{ id: string; lane: number }>) => new Map(rows.map((row) => [row.id, row.lane]));
  const overlapsInLane = (rows: Array<Task & { lane: number }>) => rows.some((left, i) => rows.some((right, j) => (
    i < j && left.lane === right.lane && left.startDate <= right.endDate && right.startDate <= left.endDate
  )));

  it('keeps every lane when an earlier task leaves (the window moved right)', () => {
    // Packed from scratch without "early", "late" would drop from lane 2 to
    // lane 1 and every bar after it would shuffle.
    const early = makeTask({ id: 'early', startDate: '2026-02-01', endDate: '2026-02-10' });
    const a = makeTask({ id: 'a', startDate: '2026-02-05', endDate: '2026-02-12' });
    const b = makeTask({ id: 'b', startDate: '2026-02-08', endDate: '2026-02-14' });
    const late = makeTask({ id: 'late', startDate: '2026-02-11', endDate: '2026-02-20' });
    const before = calculateTaskLanes([early, a, b, late]);

    const after = calculateTaskLanes([a, b, late], [], lanesOf(before));

    ['a', 'b', 'late'].forEach((id) => expect(byId(after, id).lane, id).toBe(byId(before, id).lane));
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

  it('keeps a task out of lane 0 where a time-off bar holds it', () => {
    const a = makeTask({ id: 'a', startDate: '2026-02-10', endDate: '2026-02-12' });
    const after = calculateTaskLanes([a], [{ startDate: '2026-02-11', endDate: '2026-02-11' }], new Map([['a', 0]]));
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
      const previous = new Map(tasks.map((task) => [task.id, Math.floor(random() * 5)]));
      const result = calculateTaskLanes(tasks, [], previous);
      expect(result).toHaveLength(tasks.length);
      expect(overlapsInLane(result)).toBe(false);
    }
  });
});

describe('calculateTaskLanes on a busy day', () => {
  it('gives the top lane to the longest of the tasks starting the same day', () => {
    const short1 = makeTask({ id: 'short-1', startDate: '2026-03-02', endDate: '2026-03-02' });
    const short2 = makeTask({ id: 'short-2', startDate: '2026-03-02', endDate: '2026-03-03' });
    const long = makeTask({ id: 'long', startDate: '2026-03-02', endDate: '2026-03-27' });

    const lanes = Object.fromEntries(calculateTaskLanes([short1, short2, long]).map((task) => [task.id, task.lane]));

    // The stack is gone after 3 March; the long bar stays on top, not three lanes down.
    expect(lanes.long).toBe(0);
    expect(new Set([lanes['short-1'], lanes['short-2']])).toEqual(new Set([1, 2]));
  });
});
