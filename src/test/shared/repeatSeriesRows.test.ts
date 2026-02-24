import { describe, expect, it } from 'vitest';
import { Task } from '@/features/planner/types/planner';
import { buildRepeatSeriesRows } from '@/shared/domain/repeatSeriesRows';

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 'task-id',
  title: 'Task',
  projectId: null,
  assigneeIds: [],
  startDate: '2026-02-01',
  endDate: '2026-02-01',
  statusId: 'status-1',
  typeId: 'type-1',
  priority: null,
  tagIds: [],
  description: null,
  repeatId: null,
  ...overrides,
});

describe('repeatSeriesRows', () => {
  it('builds collapsed rows for repeat series with representative tasks and metadata', () => {
    const rows = buildRepeatSeriesRows([
      makeTask({ id: 'once-1', title: 'Single', startDate: '2026-02-05', endDate: '2026-02-05' }),
      makeTask({ id: 'r1-a', title: 'Daily 1', repeatId: 'repeat-1', startDate: '2026-02-01', endDate: '2026-02-01' }),
      makeTask({ id: 'r1-b', title: 'Daily 2', repeatId: 'repeat-1', startDate: '2026-02-02', endDate: '2026-02-02' }),
      makeTask({ id: 'r2-a', title: 'Weekly 1', repeatId: 'repeat-2', startDate: '2026-02-08', endDate: '2026-02-08' }),
      makeTask({ id: 'r2-b', title: 'Weekly 2', repeatId: 'repeat-2', startDate: '2026-02-15', endDate: '2026-02-15' }),
    ]);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.key)).toEqual(['repeat:repeat-1', 'once-1', 'repeat:repeat-2']);
    expect(rows[0].task.id).toBe('r1-a');
    expect(rows[0].taskIds).toEqual(['r1-a', 'r1-b']);
    expect(rows[0].repeatMeta).toEqual({
      cadence: 'daily',
      remaining: 1,
      total: 2,
    });
    expect(rows[2].repeatMeta?.cadence).toBe('weekly');
  });

  it('expands rows without collapsing repeat series when requested', () => {
    const rows = buildRepeatSeriesRows([
      makeTask({ id: 'r-a', title: 'Repeat A', repeatId: 'repeat-1', startDate: '2026-03-03' }),
      makeTask({ id: 'r-b', title: 'Repeat B', repeatId: 'repeat-1', startDate: '2026-03-01' }),
      makeTask({ id: 'once', title: 'Single', startDate: '2026-03-02' }),
    ], { collapseRepeats: false });

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.key)).toEqual(['r-b', 'once', 'r-a']);
    expect(rows.every((row) => row.repeatMeta === null)).toBe(true);
    expect(rows.map((row) => row.taskIds)).toEqual([['r-b'], ['once'], ['r-a']]);
  });
});
