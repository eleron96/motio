import { describe, expect, it } from 'vitest';
import {
  applyTaskCommentCountDelta,
  buildTaskCommentCounts,
} from '@/shared/domain/taskCommentCount';

describe('taskCommentCount', () => {
  it('builds a zero-filled count map for requested tasks', () => {
    expect(buildTaskCommentCounts(['task-1', 'task-2'], [])).toEqual({
      'task-1': 0,
      'task-2': 0,
    });
  });

  it('counts comments only for requested task ids', () => {
    expect(
      buildTaskCommentCounts(
        ['task-1', 'task-2'],
        ['task-1', 'task-1', 'task-2', 'task-3', null, undefined],
      ),
    ).toEqual({
      'task-1': 2,
      'task-2': 1,
    });
  });

  it('applies deltas without going below zero', () => {
    const afterIncrement = applyTaskCommentCountDelta({ 'task-1': 2 }, 'task-1', 1);
    expect(afterIncrement).toEqual({ 'task-1': 3 });

    const afterDecrement = applyTaskCommentCountDelta(afterIncrement, 'task-1', -10);
    expect(afterDecrement).toEqual({ 'task-1': 0 });
  });
});
