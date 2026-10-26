import type { Task } from '@/features/planner/types/planner';

/**
 * The planner keeps ONE task cache (`plannerStore.tasks`), filled from several
 * "load scopes": the date window the timeline needs and, when the board is on,
 * every open task of the workspace regardless of dates. A task stays in the
 * cache while at least one scope claims it; realtime and reconcile use the
 * same predicates, so the cache, the loaders and live sync agree on what
 * belongs locally.
 */

/** Inclusive ISO-date window: a task belongs to it when the date ranges overlap. */
export type TaskDateWindow = {
  start: string;
  end: string;
};

/**
 * Board scope: tasks in an open status (frozen at load time) plus anything
 * touched since `recentlySince` — that keeps freshly finished or cancelled
 * tasks on the board for a while instead of having them vanish on drop.
 */
export type TaskBoardScope = {
  workspaceId: string;
  openStatusIds: string[];
  /** ISO timestamp; tasks with `updatedAt >= recentlySince` are in scope. */
  recentlySince: string;
};

export type TaskLoadScopes = {
  window: TaskDateWindow | null;
  board: TaskBoardScope | null;
};

/** How long finished/cancelled tasks stay on the board after their last change. */
export const BOARD_RECENTLY_CHANGED_DAYS = 14;

type DatedTask = Pick<Task, 'startDate' | 'endDate'>;
type ScopedTask = Pick<Task, 'startDate' | 'endDate' | 'statusId' | 'updatedAt'>;

export const isTaskInWindow = (task: DatedTask, window: TaskDateWindow): boolean => (
  task.endDate >= window.start && task.startDate <= window.end
);

export const windowContains = (outer: TaskDateWindow, inner: TaskDateWindow): boolean => (
  outer.start <= inner.start && outer.end >= inner.end
);

export const isTaskInBoardScope = (task: ScopedTask, board: TaskBoardScope): boolean => {
  if (board.openStatusIds.includes(task.statusId)) return true;
  // ISO timestamps compare correctly as strings only in the same format;
  // compare as instants so "Z" and "+00:00" offsets agree.
  if (!task.updatedAt) return false;
  return Date.parse(task.updatedAt) >= Date.parse(board.recentlySince);
};

export const isTaskInLoadScopes = (task: ScopedTask, scopes: TaskLoadScopes): boolean => (
  (scopes.window !== null && isTaskInWindow(task, scopes.window))
  || (scopes.board !== null && isTaskInBoardScope(task, scopes.board))
);

export const buildBoardScope = (
  workspaceId: string,
  statuses: ReadonlyArray<{ id: string; isFinal: boolean; isCancelled: boolean }>,
  now: Date,
): TaskBoardScope => ({
  workspaceId,
  openStatusIds: statuses
    .filter((status) => !status.isFinal && !status.isCancelled)
    .map((status) => status.id),
  recentlySince: new Date(now.getTime() - BOARD_RECENTLY_CHANGED_DAYS * 24 * 60 * 60 * 1000).toISOString(),
});

/**
 * Result of a fresh window load: the window rows replace whatever the cache
 * held, except tasks another scope (the board) still claims. Without a board
 * scope this is exactly the incoming list — the pre-scope behaviour.
 */
export const mergeWindowLoad = (
  existing: Task[],
  incoming: Task[],
  board: TaskBoardScope | null,
): Task[] => {
  if (!board) return incoming;
  const incomingIds = new Set(incoming.map((task) => task.id));
  const kept = existing.filter((task) => !incomingIds.has(task.id) && isTaskInBoardScope(task, board));
  return kept.length > 0 ? [...incoming, ...kept] : incoming;
};

/**
 * Result of a board load: board rows are upserted over the cache; tasks only
 * the previous board scope held and the new one no longer claims are dropped.
 */
export const mergeBoardLoad = (
  existing: Task[],
  incoming: Task[],
  scopes: TaskLoadScopes,
): Task[] => {
  const incomingById = new Map(incoming.map((task) => [task.id, task]));
  const next: Task[] = [];
  existing.forEach((task) => {
    const fresh = incomingById.get(task.id);
    if (fresh) {
      next.push(fresh);
      incomingById.delete(task.id);
      return;
    }
    if (scopes.window && isTaskInWindow(task, scopes.window)) {
      next.push(task);
    }
  });
  incomingById.forEach((task) => next.push(task));
  return next;
};

/** Drops tasks that only a released scope held: what remains is the window. */
export const pruneToWindow = (tasks: Task[], window: TaskDateWindow | null): Task[] => {
  if (!window) return [];
  const next = tasks.filter((task) => isTaskInWindow(task, window));
  return next.length === tasks.length ? tasks : next;
};
