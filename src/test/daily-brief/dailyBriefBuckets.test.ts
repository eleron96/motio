import { describe, expect, it } from 'vitest';
import { getOverdueDays, splitDailyBriefTasks } from '@/features/daily-brief/lib/dailyBriefBuckets';
import type { Task } from '@/features/planner/types/planner';

const makeTask = (id: string, endDate: string): Task => ({
  id,
  title: `Task ${id}`,
  projectId: null,
  assigneeIds: [],
  startDate: endDate,
  endDate,
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
});

const TODAY = '2026-07-25';

describe('splitDailyBriefTasks', () => {
  it('puts tasks due before today in overdue and tasks due today in today', () => {
    const tasks = [
      makeTask('a', '2026-04-24'),
      makeTask('b', '2026-07-24'),
      makeTask('c', TODAY),
      makeTask('d', TODAY),
    ];

    const { overdue, today } = splitDailyBriefTasks(tasks, TODAY);

    expect(overdue.map((t) => t.id)).toEqual(['a', 'b']);
    expect(today.map((t) => t.id)).toEqual(['c', 'd']);
  });

  it('never counts a task in both buckets', () => {
    const tasks = [makeTask('a', '2026-07-24'), makeTask('b', TODAY)];

    const { overdue, today } = splitDailyBriefTasks(tasks, TODAY);

    expect(overdue.length + today.length).toBe(tasks.length);
    expect(overdue.some((t) => today.includes(t))).toBe(false);
  });

  it('drops future dates — the brief only looks back for tasks', () => {
    const tasks = [makeTask('a', '2026-07-26'), makeTask('b', TODAY)];

    const { overdue, today } = splitDailyBriefTasks(tasks, TODAY);

    expect(overdue).toEqual([]);
    expect(today.map((t) => t.id)).toEqual(['b']);
  });

  it('handles an empty fetch', () => {
    expect(splitDailyBriefTasks([], TODAY)).toEqual({ overdue: [], today: [] });
  });

  it('compares across month and year boundaries', () => {
    const tasks = [makeTask('a', '2025-12-31'), makeTask('b', '2026-07-01')];

    const { overdue } = splitDailyBriefTasks(tasks, TODAY);

    expect(overdue.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('getOverdueDays', () => {
  it('counts calendar days since the due date', () => {
    expect(getOverdueDays('2026-07-24', TODAY)).toBe(1);
    expect(getOverdueDays('2026-04-24', TODAY)).toBe(92);
  });

  it('returns 0 for today and clamps future dates', () => {
    expect(getOverdueDays(TODAY, TODAY)).toBe(0);
    expect(getOverdueDays('2026-07-26', TODAY)).toBe(0);
  });
});
