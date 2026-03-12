import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAST_TASK_SORT,
  isTaskInScope,
  shouldCollapseRepeatSeriesInTaskScope,
} from '@/shared/domain/taskScope';

describe('taskScope', () => {
  it('treats tasks ending today as current', () => {
    expect(isTaskInScope({ endDate: '2026-03-12' }, 'current', '2026-03-12')).toBe(true);
    expect(isTaskInScope({ endDate: '2026-03-12' }, 'past', '2026-03-12')).toBe(false);
  });

  it('treats tasks ending before today as past', () => {
    expect(isTaskInScope({ endDate: '2026-03-11' }, 'current', '2026-03-12')).toBe(false);
    expect(isTaskInScope({ endDate: '2026-03-11' }, 'past', '2026-03-12')).toBe(true);
  });

  it('collapses repeat series only in current scope', () => {
    expect(shouldCollapseRepeatSeriesInTaskScope('current')).toBe(true);
    expect(shouldCollapseRepeatSeriesInTaskScope('past')).toBe(false);
  });

  it('uses descending end date for past tasks by default', () => {
    expect(DEFAULT_PAST_TASK_SORT).toBe('end_desc');
  });
});
