import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAST_TASK_SORT,
  shouldCollapseRepeatSeriesInTaskScope,
} from '@/shared/domain/taskScope';

describe('taskScope', () => {
  it('collapses repeat series only in current scope', () => {
    expect(shouldCollapseRepeatSeriesInTaskScope('current')).toBe(true);
    expect(shouldCollapseRepeatSeriesInTaskScope('past')).toBe(false);
  });

  it('uses descending end date for past tasks by default', () => {
    expect(DEFAULT_PAST_TASK_SORT).toBe('end_desc');
  });
});
