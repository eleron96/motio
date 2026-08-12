import { describe, expect, it } from 'vitest';
import {
  buildDateUndoRow,
  buildDetachUndoRow,
  buildFieldUndoRow,
  classifyDateChange,
  collectUndoCascade,
  pushUndoEntry,
  TASK_UNDO_STACK_LIMIT,
  TaskUndoEntry,
} from '@/shared/domain/taskUndo';

const entry = (
  id: string,
  taskIds: string[],
  workspaceId = 'ws-1',
): TaskUndoEntry => ({
  id,
  workspaceId,
  kind: 'move',
  rows: taskIds.map((taskId) => ({
    taskId,
    restore: { start_date: '2026-08-01', end_date: '2026-08-02' },
    expect: { start_date: '2026-08-03', end_date: '2026-08-04' },
  })),
});

describe('classifyDateChange', () => {
  it('same duration is a move', () => {
    expect(classifyDateChange(
      { startDate: '2026-08-01', endDate: '2026-08-03' },
      { startDate: '2026-08-05', endDate: '2026-08-07' },
    )).toBe('move');
  });

  it('changed duration is a resize', () => {
    expect(classifyDateChange(
      { startDate: '2026-08-01', endDate: '2026-08-03' },
      { startDate: '2026-08-01', endDate: '2026-08-05' },
    )).toBe('resize');
  });
});

describe('buildDateUndoRow', () => {
  it('restores the before-span and expects the after-span', () => {
    expect(buildDateUndoRow(
      't1',
      { startDate: '2026-08-01', endDate: '2026-08-02' },
      { startDate: '2026-08-04', endDate: '2026-08-05' },
    )).toEqual({
      taskId: 't1',
      restore: { start_date: '2026-08-01', end_date: '2026-08-02' },
      expect: { start_date: '2026-08-04', end_date: '2026-08-05' },
    });
  });
});

describe('buildDetachUndoRow', () => {
  it('restores the series link and only applies while the task is still detached', () => {
    const row = buildDetachUndoRow(
      't1',
      { startDate: '2026-08-01', endDate: '2026-08-02', repeatId: 'series-9' },
      { startDate: '2026-08-04', endDate: '2026-08-05' },
    );
    expect(row.restore.repeat_id).toBe('series-9');
    expect(row.expect.repeat_id).toBeNull();
  });
});

describe('buildFieldUndoRow', () => {
  it('splits before/after pairs into restore and expect payloads', () => {
    expect(buildFieldUndoRow('t1', {
      status_id: { before: 'status-a', after: 'status-b' },
      priority: { before: null, after: 'high' },
    })).toEqual({
      taskId: 't1',
      restore: { status_id: 'status-a', priority: null },
      expect: { status_id: 'status-b', priority: 'high' },
    });
  });
});

describe('pushUndoEntry', () => {
  it('prepends newest first', () => {
    const stack = pushUndoEntry([entry('a', ['t1'])], entry('b', ['t2']));
    expect(stack.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('caps the stack at the limit, dropping the oldest', () => {
    let stack: TaskUndoEntry[] = [];
    for (let index = 0; index < TASK_UNDO_STACK_LIMIT + 5; index += 1) {
      stack = pushUndoEntry(stack, entry(`e${index}`, ['t1']));
    }
    expect(stack).toHaveLength(TASK_UNDO_STACK_LIMIT);
    expect(stack[0].id).toBe(`e${TASK_UNDO_STACK_LIMIT + 4}`);
    expect(stack.at(-1)?.id).toBe('e5');
  });

  it('drops entries from another workspace so they can never replay', () => {
    const stack = pushUndoEntry(
      [entry('old', ['t1'], 'ws-OTHER')],
      entry('fresh', ['t2'], 'ws-1'),
    );
    expect(stack.map((item) => item.id)).toEqual(['fresh']);
  });
});

describe('collectUndoCascade', () => {
  it('returns just the target when nothing newer touches its tasks', () => {
    const stack = [entry('newer', ['t9']), entry('target', ['t1'])];
    const { toUndo, rest } = collectUndoCascade(stack, 'target');
    expect(toUndo.map((item) => item.id)).toEqual(['target']);
    expect(rest.map((item) => item.id)).toEqual(['newer']);
  });

  it('pulls in newer entries for the same task, newest first, target last', () => {
    const stack = [
      entry('n2', ['t1']),
      entry('other', ['t9']),
      entry('n1', ['t1']),
      entry('target', ['t1']),
    ];
    const { toUndo, rest } = collectUndoCascade(stack, 'target');
    expect(toUndo.map((item) => item.id)).toEqual(['n2', 'n1', 'target']);
    expect(rest.map((item) => item.id)).toEqual(['other']);
  });

  it('grows the task set transitively through overlapping entries', () => {
    // target touches t1; mid touches t1+t2; top touches only t2 — undoing the
    // target must unwind top as well, or mid's expect-guard on t2 would fail.
    const stack = [
      entry('top', ['t2']),
      entry('mid', ['t1', 't2']),
      entry('target', ['t1']),
    ];
    const { toUndo, rest } = collectUndoCascade(stack, 'target');
    expect(toUndo.map((item) => item.id)).toEqual(['top', 'mid', 'target']);
    expect(rest).toHaveLength(0);
  });

  it('leaves the stack untouched for an unknown id', () => {
    const stack = [entry('a', ['t1'])];
    const { toUndo, rest } = collectUndoCascade(stack, 'missing');
    expect(toUndo).toHaveLength(0);
    expect(rest).toBe(stack);
  });
});
