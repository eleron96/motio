import { describe, expect, it } from 'vitest';
import { buildRepeatSeriesRebuildPlan } from '@/shared/domain/repeatSeriesRebuild';

describe('repeatSeriesRebuild', () => {
  it('rebuilds a weekly series into a biweekly schedule from the first task', () => {
    const plan = buildRepeatSeriesRebuildPlan({
      anchorTaskId: 'task-1',
      tasks: [
        { id: 'task-1', startDate: '2026-02-01', endDate: '2026-02-01' },
        { id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-08' },
        { id: 'task-3', startDate: '2026-02-15', endDate: '2026-02-15' },
      ],
      options: {
        frequency: 'biweekly',
        ends: 'after',
        count: 3,
      },
    });

    expect(plan).toEqual({
      updates: [
        { id: 'task-2', startDate: '2026-02-15', endDate: '2026-02-15' },
        { id: 'task-3', startDate: '2026-03-01', endDate: '2026-03-01' },
      ],
      deleteIds: [],
      create: [],
    });
  });

  it('rebuilds only the selected and following tasks when the anchor is in the middle of the series', () => {
    const plan = buildRepeatSeriesRebuildPlan({
      anchorTaskId: 'task-2',
      tasks: [
        { id: 'task-1', startDate: '2026-02-01', endDate: '2026-02-01' },
        { id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-08' },
        { id: 'task-3', startDate: '2026-02-15', endDate: '2026-02-15' },
        { id: 'task-4', startDate: '2026-02-22', endDate: '2026-02-22' },
      ],
      options: {
        frequency: 'biweekly',
        ends: 'after',
        count: 3,
      },
    });

    expect(plan).toEqual({
      updates: [
        { id: 'task-3', startDate: '2026-02-22', endDate: '2026-02-22' },
        { id: 'task-4', startDate: '2026-03-08', endDate: '2026-03-08' },
      ],
      deleteIds: [],
      create: [],
    });
  });

  it('drops extra future tasks when the rebuilt cadence needs fewer occurrences', () => {
    const plan = buildRepeatSeriesRebuildPlan({
      anchorTaskId: 'task-1',
      tasks: [
        { id: 'task-1', startDate: '2026-02-01', endDate: '2026-02-01' },
        { id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-08' },
        { id: 'task-3', startDate: '2026-02-15', endDate: '2026-02-15' },
      ],
      options: {
        frequency: 'weekly',
        ends: 'after',
        count: 2,
      },
    });

    expect(plan).toEqual({
      updates: [],
      deleteIds: ['task-3'],
      create: [],
    });
  });
});
