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
