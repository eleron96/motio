import { describe, expect, it } from 'vitest';
import { applyTaskCommentCountDelta } from '@/shared/domain/taskCommentCount';

describe('taskCommentCount', () => {
  it('applies deltas without going below zero', () => {
    const afterIncrement = applyTaskCommentCountDelta({ 'task-1': 2 }, 'task-1', 1);
    expect(afterIncrement).toEqual({ 'task-1': 3 });

    const afterDecrement = applyTaskCommentCountDelta(afterIncrement, 'task-1', -10);
    expect(afterDecrement).toEqual({ 'task-1': 0 });
  });
});
