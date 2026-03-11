import { describe, expect, it } from 'vitest';
import {
  applyTaskCommentCountDelta,
  batchTaskCommentTaskIds,
  buildTaskCommentCounts,
  TASK_COMMENT_QUERY_BATCH_SIZE,
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

  it('batches unique task ids for comment queries', () => {
    const taskIds = Array.from(
      { length: TASK_COMMENT_QUERY_BATCH_SIZE + 2 },
      (_, index) => `task-${index}`,
    );

    expect(batchTaskCommentTaskIds([...taskIds, taskIds[0], '', null])).toEqual([
      taskIds.slice(0, TASK_COMMENT_QUERY_BATCH_SIZE),
      taskIds.slice(TASK_COMMENT_QUERY_BATCH_SIZE),
    ]);
  });
});
