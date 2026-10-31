import { describe, expect, it } from 'vitest';
import {
  moveListItem,
  reorderSubtasks,
  resolveSubtaskDropIndex,
  resolveSubtaskPositionUpdates,
  resolveSubtaskShiftOffsets,
} from '@/shared/domain/taskSubtaskOrder';

// Three 30px rows with a 2px gap: tops 0, 32, 64.
const rows = [
  { top: 0, height: 30 },
  { top: 32, height: 30 },
  { top: 64, height: 30 },
];

describe('moveListItem', () => {
  it('moves an item down and up', () => {
    expect(moveListItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveListItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('clamps the target and ignores an unknown source', () => {
    expect(moveListItem(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a']);
    expect(moveListItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('resolveSubtaskDropIndex', () => {
  it('stays in place until the middle of a neighbour is crossed', () => {
    // Middle of row 0 is at 15, of row 1 at 47, of row 2 at 79.
    expect(resolveSubtaskDropIndex(rows, 0, 30)).toBe(0);
    expect(resolveSubtaskDropIndex(rows, 0, 35)).toBe(1);
    expect(resolveSubtaskDropIndex(rows, 0, 60)).toBe(1);
    expect(resolveSubtaskDropIndex(rows, 0, 70)).toBe(2);
  });

  it('moves up past the rows above', () => {
    expect(resolveSubtaskDropIndex(rows, 2, -20)).toBe(2);
    expect(resolveSubtaskDropIndex(rows, 2, -35)).toBe(1);
    expect(resolveSubtaskDropIndex(rows, 2, -70)).toBe(0);
    expect(resolveSubtaskDropIndex(rows, 2, -500)).toBe(0);
  });
});

describe('resolveSubtaskShiftOffsets', () => {
  it('slides the passed rows by the dragged row plus the gap', () => {
    expect(resolveSubtaskShiftOffsets(rows, 0, 2)).toEqual([0, -32, -32]);
    expect(resolveSubtaskShiftOffsets(rows, 2, 1)).toEqual([0, 32, 0]);
    expect(resolveSubtaskShiftOffsets(rows, 1, 1)).toEqual([0, 0, 0]);
  });
});

describe('resolveSubtaskPositionUpdates / reorderSubtasks', () => {
  it('renumbers 0…n-1 and writes only the rows whose number changed', () => {
    expect(resolveSubtaskPositionUpdates([
      { id: 'a', position: 0 },
      { id: 'b', position: 5 },
      { id: 'c', position: 2 },
    ])).toEqual([{ id: 'b', position: 1 }]);
  });

  it('moves a subtask and returns the new list with its writes', () => {
    const result = reorderSubtasks([
      { id: 'a', position: 0, title: 'A' },
      { id: 'b', position: 1, title: 'B' },
      { id: 'c', position: 4, title: 'C' },
    ], 'c', 0);
    expect(result?.items.map((item) => [item.id, item.position, item.title])).toEqual([
      ['c', 0, 'C'],
      ['a', 1, 'A'],
      ['b', 2, 'B'],
    ]);
    expect(result?.updates).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('returns null for a no-op move or an unknown subtask', () => {
    const items = [{ id: 'a', position: 0 }, { id: 'b', position: 1 }];
    expect(reorderSubtasks(items, 'a', 0)).toBeNull();
    expect(reorderSubtasks(items, 'x', 1)).toBeNull();
  });
});
