import { describe, expect, it } from 'vitest';
import { buildShiftedRepeatTasks } from '@/shared/domain/repeatTaskMove';

describe('repeatTaskMove', () => {
  it('shifts each task in the series by the same drag delta', () => {
    const shiftedTasks = buildShiftedRepeatTasks(
      { startDate: '2026-02-01', endDate: '2026-02-01' },
      { startDate: '2026-02-03', endDate: '2026-02-03' },
      [
        { id: 'task-1', startDate: '2026-02-01', endDate: '2026-02-01' },
        { id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-08' },
        { id: 'task-3', startDate: '2026-02-15', endDate: '2026-02-15' },
      ],
    );

    expect(shiftedTasks).toEqual([
      { id: 'task-1', startDate: '2026-02-03', endDate: '2026-02-03' },
      { id: 'task-2', startDate: '2026-02-10', endDate: '2026-02-10' },
      { id: 'task-3', startDate: '2026-02-17', endDate: '2026-02-17' },
    ]);
  });

  it('applies the same resize delta to each task in the series', () => {
    const shiftedTasks = buildShiftedRepeatTasks(
      { startDate: '2026-02-01', endDate: '2026-02-03' },
      { startDate: '2026-02-01', endDate: '2026-02-05' },
      [
        { id: 'task-1', startDate: '2026-02-01', endDate: '2026-02-03' },
        { id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-10' },
      ],
    );

    expect(shiftedTasks).toEqual([
      { id: 'task-1', startDate: '2026-02-01', endDate: '2026-02-05' },
      { id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-12' },
    ]);
  });

  it('clamps resized tasks when a shared delta would invert a shorter range', () => {
    const shiftedTasks = buildShiftedRepeatTasks(
      { startDate: '2026-02-01', endDate: '2026-02-03' },
      { startDate: '2026-02-04', endDate: '2026-02-03' },
      [
        { id: 'task-1', startDate: '2026-02-01', endDate: '2026-02-03' },
        { id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-08' },
      ],
    );

    expect(shiftedTasks).toEqual([
      { id: 'task-1', startDate: '2026-02-03', endDate: '2026-02-03' },
      { id: 'task-2', startDate: '2026-02-08', endDate: '2026-02-08' },
    ]);
  });
});
