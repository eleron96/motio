import { Task } from '@/features/planner/types/planner';

/**
 * Edits one person made to a task while its card was open.
 *
 * The card's "unsaved changes" warning and its Discard used to compare the
 * task with a snapshot taken when the card opened. Live sync also updates the
 * task, so a teammate's change looked like ours: the warning popped up for
 * nobody's edit, and Discard wrote the whole snapshot back over the teammate.
 * Recording only our own edits fixes both.
 *
 * Per field: `from` is the value before our first edit, `to` is the value our
 * last edit left behind.
 */
export type TaskOwnEditField =
  | 'title'
  | 'projectId'
  | 'assigneeIds'
  | 'statusId'
  | 'typeId'
  | 'priority'
  | 'startDate'
  | 'endDate'
  | 'description'
  | 'tagIds'
  | 'repeatId';

export type TaskOwnEdits = Partial<Record<TaskOwnEditField, {
  from: Task[TaskOwnEditField];
  to: Task[TaskOwnEditField];
}>>;

const OWN_EDIT_FIELDS: ReadonlySet<string> = new Set<TaskOwnEditField>([
  'title',
  'projectId',
  'assigneeIds',
  'statusId',
  'typeId',
  'priority',
  'startDate',
  'endDate',
  'description',
  'tagIds',
  'repeatId',
]);

const isOwnEditField = (key: string): key is TaskOwnEditField => OWN_EDIT_FIELDS.has(key);

/** Arrays compare by items; an empty description is the same as none. */
export const areTaskFieldValuesEqual = (left: unknown, right: unknown) => {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return (left ?? '') === (right ?? '');
};

const copyValue = <T>(value: T): T => (Array.isArray(value) ? [...value] as T : value);

/** Adds an edit we just saved; `before` is the task as it was right before it. */
export const recordTaskOwnEdits = (
  edits: TaskOwnEdits,
  before: Task,
  updates: Partial<Task>,
): TaskOwnEdits => {
  const next: TaskOwnEdits = { ...edits };
  for (const [key, value] of Object.entries(updates)) {
    if (!isOwnEditField(key)) continue;
    const previous = next[key];
    next[key] = {
      from: previous ? previous.from : copyValue(before[key]),
      to: copyValue(value as Task[TaskOwnEditField]),
    };
  }
  return next;
};

/**
 * What Discard writes back: our edits that actually changed something and
 * still stand. A field a teammate changed after us is left alone — their
 * newer value wins, just like undo on the timeline.
 */
export const resolveTaskOwnEditsRevert = (
  edits: TaskOwnEdits,
  live: Task,
): Partial<Task> => {
  const restore: Partial<Task> = {};
  for (const [key, edit] of Object.entries(edits)) {
    if (!edit || !isOwnEditField(key)) continue;
    if (areTaskFieldValuesEqual(edit.from, edit.to)) continue;
    if (!areTaskFieldValuesEqual(live[key], edit.to)) continue;
    (restore as Record<string, unknown>)[key] = copyValue(edit.from);
  }
  return restore;
};

export const hasTaskOwnEditsToRevert = (edits: TaskOwnEdits, live: Task) => (
  Object.keys(resolveTaskOwnEditsRevert(edits, live)).length > 0
);
