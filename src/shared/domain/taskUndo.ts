import { differenceInCalendarDays, parseISO } from 'date-fns';

/**
 * Undo model for timeline mutations.
 *
 * An undo entry is an "inverse conditional update": `restore` holds the raw
 * column values to write back, `expect` holds the values the original action
 * left behind. Applying an undo row is only valid while every `expect` column
 * still matches the live row — if a teammate changed those columns after us,
 * the undo must NOT clobber their newer intent. Columns outside `restore` are
 * never touched, so concurrent edits to unrelated fields (title, status…)
 * neither block the undo nor get overwritten by it.
 */

export type TaskUndoFieldValue = string | null;

export type TaskUndoRow = {
  taskId: string;
  /** Raw column values to write back when undoing. */
  restore: Record<string, TaskUndoFieldValue>;
  /** Column values our action set — undo applies only while these still hold. */
  expect: Record<string, TaskUndoFieldValue>;
};

export type TaskUndoKind =
  | 'move'
  | 'resize'
  | 'series-move'
  | 'detach-move'
  | 'quick-edit'
  | 'delete';

export type TaskUndoEntry = {
  id: string;
  workspaceId: string;
  kind: TaskUndoKind;
  rows: TaskUndoRow[];
};

export type TaskUndoOutcome = {
  restored: number;
  stale: number;
  failed: number;
  total: number;
};

export const TASK_UNDO_STACK_LIMIT = 20;

type TaskDateSpan = {
  startDate: string;
  endDate: string;
};

const spanDurationDays = (span: TaskDateSpan) => (
  differenceInCalendarDays(parseISO(span.endDate), parseISO(span.startDate))
);

/** A drag keeps the duration; a resize changes it. Used only for toast copy. */
export const classifyDateChange = (
  before: TaskDateSpan,
  after: TaskDateSpan,
): 'move' | 'resize' => (
  spanDurationDays(before) === spanDurationDays(after) ? 'move' : 'resize'
);

export const buildDateUndoRow = (
  taskId: string,
  before: TaskDateSpan,
  after: TaskDateSpan,
): TaskUndoRow => ({
  taskId,
  restore: { start_date: before.startDate, end_date: before.endDate },
  expect: { start_date: after.startDate, end_date: after.endDate },
});

/**
 * "Only this task" on a repeat move both shifts the dates and detaches the
 * occurrence (repeat_id -> null). Undo restores the series link too; the
 * `repeat_id: null` expectation makes the undo bail if the task has been
 * re-linked into a (new) series since.
 */
export const buildDetachUndoRow = (
  taskId: string,
  before: TaskDateSpan & { repeatId: string },
  after: TaskDateSpan,
): TaskUndoRow => ({
  taskId,
  restore: {
    start_date: before.startDate,
    end_date: before.endDate,
    repeat_id: before.repeatId,
  },
  expect: {
    start_date: after.startDate,
    end_date: after.endDate,
    repeat_id: null,
  },
});

/**
 * Generic single-task row for quick edits (status/priority/project from the
 * context menu): each column carries its before/after pair.
 */
export const buildFieldUndoRow = (
  taskId: string,
  columns: Record<string, { before: TaskUndoFieldValue; after: TaskUndoFieldValue }>,
): TaskUndoRow => ({
  taskId,
  restore: Object.fromEntries(
    Object.entries(columns).map(([column, value]) => [column, value.before]),
  ),
  expect: Object.fromEntries(
    Object.entries(columns).map(([column, value]) => [column, value.after]),
  ),
});

/**
 * Newest-first push. Entries from another workspace are dropped so a workspace
 * switch can never replay foreign mutations.
 */
export const pushUndoEntry = (
  stack: TaskUndoEntry[],
  entry: TaskUndoEntry,
  limit: number = TASK_UNDO_STACK_LIMIT,
): TaskUndoEntry[] => (
  [entry, ...stack.filter((item) => item.workspaceId === entry.workspaceId)]
    .slice(0, Math.max(1, limit))
);

const entryTaskIds = (entry: TaskUndoEntry) => entry.rows.map((row) => row.taskId);

/**
 * Undoing an entry must first undo MY OWN newer entries touching the same
 * tasks, or their `expect` guards would refuse (the newer action changed the
 * columns again). Walks newer entries oldest-to-newest, growing the affected
 * task set transitively, and returns them newest-first with the target last —
 * the exact execution order. Entries by other users don't exist here: the
 * stack only ever holds this client's actions.
 */
export const collectUndoCascade = (
  stack: TaskUndoEntry[],
  entryId: string,
): { toUndo: TaskUndoEntry[]; rest: TaskUndoEntry[] } => {
  const targetIndex = stack.findIndex((entry) => entry.id === entryId);
  if (targetIndex === -1) {
    return { toUndo: [], rest: stack };
  }

  const target = stack[targetIndex];
  const affectedTaskIds = new Set(entryTaskIds(target));
  const cascadeOldestFirst: TaskUndoEntry[] = [];

  // index 0 is newest; scanning targetIndex-1 -> 0 visits newer entries in
  // oldest-to-newest order, so transitive overlaps resolve in one pass.
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const entry = stack[index];
    if (!entryTaskIds(entry).some((taskId) => affectedTaskIds.has(taskId))) continue;
    cascadeOldestFirst.push(entry);
    entryTaskIds(entry).forEach((taskId) => affectedTaskIds.add(taskId));
  }

  const toUndo = [...cascadeOldestFirst].reverse().concat(target);
  const undoneIds = new Set(toUndo.map((entry) => entry.id));
  const rest = stack.filter((entry) => !undoneIds.has(entry.id));
  return { toUndo, rest };
};
