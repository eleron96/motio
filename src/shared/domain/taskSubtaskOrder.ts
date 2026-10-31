/**
 * Order of a task's subtasks: dragging one to another place in the list.
 *
 * The list is shown sorted by `position`; a move renumbers it 0…n-1 so the
 * gaps left by deletions and the ties of old rows disappear, and only the rows
 * whose number actually changed are written back.
 */

export interface SubtaskOrderItem {
  id: string;
  position: number;
}

export interface SubtaskPositionUpdate {
  id: string;
  position: number;
}

/** Vertical extent of a row on screen, as measured when the drag started. */
export interface SubtaskRowBox {
  top: number;
  height: number;
}

/** `items` with the one at `from` moved to `to` (both clamped to the list). */
export const moveListItem = <T,>(items: readonly T[], from: number, to: number): T[] => {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const target = Math.max(0, Math.min(next.length - 1, to));
  if (target === from) return next;
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
};

/**
 * Where the dragged row lands: it takes the place of every row whose middle
 * its own middle has crossed. `rows` are the boxes before the drag, `offsetY`
 * how far the pointer has moved since.
 */
export const resolveSubtaskDropIndex = (
  rows: readonly SubtaskRowBox[],
  draggedIndex: number,
  offsetY: number,
): number => {
  const dragged = rows[draggedIndex];
  if (!dragged) return draggedIndex;
  const middle = dragged.top + offsetY + dragged.height / 2;
  let index = draggedIndex;
  for (let i = draggedIndex + 1; i < rows.length; i += 1) {
    if (middle > rows[i].top + rows[i].height / 2) index = i;
  }
  for (let i = draggedIndex - 1; i >= 0; i -= 1) {
    if (middle < rows[i].top + rows[i].height / 2) index = i;
  }
  return index;
};

/**
 * How far each row slides while one is dragged from `from` to `to`: the rows
 * in between step aside by the dragged row's height plus the gap between rows.
 * The dragged row itself follows the pointer and is not included (0).
 */
export const resolveSubtaskShiftOffsets = (
  rows: readonly SubtaskRowBox[],
  from: number,
  to: number,
): number[] => {
  const dragged = rows[from];
  if (!dragged) return rows.map(() => 0);
  const next = rows[from + 1] ?? rows[from - 1];
  const gap = next
    ? Math.max(0, next.top > dragged.top
      ? next.top - (dragged.top + dragged.height)
      : dragged.top - (next.top + next.height))
    : 0;
  const step = dragged.height + gap;
  return rows.map((_, index) => {
    if (from < to && index > from && index <= to) return -step;
    if (from > to && index < from && index >= to) return step;
    return 0;
  });
};

/** The renumbered rows (0…n-1 in list order) whose position has changed. */
export const resolveSubtaskPositionUpdates = (
  ordered: readonly SubtaskOrderItem[],
): SubtaskPositionUpdate[] => (
  ordered.flatMap((item, index) => (
    item.position === index ? [] : [{ id: item.id, position: index }]
  ))
);

/**
 * Moves the subtask `id` to `toIndex` and renumbers the list. Returns the new
 * list (positions already updated) and the writes it needs; `null` when the
 * subtask isn't in the list or stays where it was.
 */
export const reorderSubtasks = <T extends SubtaskOrderItem>(
  items: readonly T[],
  id: string,
  toIndex: number,
): { items: T[]; updates: SubtaskPositionUpdate[] } | null => {
  const from = items.findIndex((item) => item.id === id);
  if (from < 0) return null;
  const moved = moveListItem(items, from, toIndex);
  if (moved.every((item, index) => item === items[index])) return null;
  const updates = resolveSubtaskPositionUpdates(moved);
  return {
    items: moved.map((item, index) => (item.position === index ? item : { ...item, position: index })),
    updates,
  };
};
