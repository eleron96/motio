import type { Task } from '@/features/planner/types/planner';

/**
 * Single-task writes in flight (optimistic updateTask).
 *
 * The store shows a change the moment it is made; the write follows. Writes to
 * one task go out strictly one after another, so the database ends up with the
 * last value even when the person drags a bar twice in a row. While a task has
 * a write in flight, rows for it from live sync and reconcile are held back —
 * they can carry an older value than the one already on screen — and the newest
 * of them is applied after the write settles if it is newer than the write's
 * own answer (a teammate's change made meanwhile).
 */

type TaskWriteState = {
  latestSeq: number;
  /** The task as the server last confirmed it: what a failed write rolls back to. */
  confirmed: Task | null;
  /** Newest live-sync row that arrived while the write was in flight. */
  deferred: Task | null;
};

const writes = new Map<string, TaskWriteState>();
const chains = new Map<string, Promise<void>>();
let seqCounter = 0;

const updatedAtMs = (task: Task | null | undefined) => {
  const value = task?.updatedAt ? Date.parse(task.updatedAt) : Number.NaN;
  return Number.isFinite(value) ? value : -Infinity;
};

/** Starts a write; `current` is the store row right before its optimistic patch. */
export const beginTaskWrite = (taskId: string, current: Task | null): number => {
  const seq = ++seqCounter;
  const existing = writes.get(taskId);
  writes.set(taskId, {
    latestSeq: seq,
    confirmed: existing ? existing.confirmed : current,
    deferred: existing ? existing.deferred : null,
  });
  return seq;
};

export const isLatestTaskWrite = (taskId: string, seq: number) => writes.get(taskId)?.latestSeq === seq;

/** Records the server's answer as the new confirmed state of the task. */
export const confirmTaskWrite = (taskId: string, row: Task) => {
  const state = writes.get(taskId);
  if (state) state.confirmed = row;
};

export const getConfirmedTask = (taskId: string) => writes.get(taskId)?.confirmed ?? null;

/** Holds back a live-sync row while the task has a write in flight. */
export const deferTaskRowIfWriting = (row: Task): boolean => {
  const state = writes.get(row.id);
  if (!state) return false;
  if (!state.deferred || updatedAtMs(row) >= updatedAtMs(state.deferred)) state.deferred = row;
  return true;
};

/**
 * Ends the latest write of a task. Returns a held-back row that is newer than
 * `applied` (the row now in the store), so the caller can apply it too.
 */
export const finishTaskWrite = (taskId: string, seq: number, applied: Task | null): Task | null => {
  const state = writes.get(taskId);
  if (!state || state.latestSeq !== seq) return null;
  writes.delete(taskId);
  const deferred = state.deferred;
  if (!deferred) return null;
  return updatedAtMs(deferred) > updatedAtMs(applied) ? deferred : null;
};

/** Runs `run` after every earlier write to the same task has settled. */
export const queueTaskWrite = (taskId: string, run: () => Promise<void>): Promise<void> => {
  const previous = chains.get(taskId) ?? Promise.resolve();
  const next = previous.then(run, run);
  const tail = next.catch(() => undefined);
  chains.set(taskId, tail);
  void tail.then(() => {
    if (chains.get(taskId) === tail) chains.delete(taskId);
  });
  return next;
};

/** Test helper and workspace reset. */
export const resetTaskWrites = () => {
  writes.clear();
  chains.clear();
};
