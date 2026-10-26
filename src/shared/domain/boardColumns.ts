import type { Status, Task, TaskPriority } from '@/features/planner/types/planner';
import { isTaskInBoardScope, type TaskBoardScope } from '@/shared/domain/taskLoadScopes';

/**
 * Board (kanban) layout rules: one column per workspace status, cards are the
 * tasks the board scope claims, a repeat series shows as one card per column.
 * Pure — the board components only render what these functions return.
 */

export type BoardColumnKind = 'open' | 'final' | 'cancelled';

export type BoardColumn = {
  status: Status;
  kind: BoardColumnKind;
  tasks: Task[];
};

const columnKind = (status: Pick<Status, 'isFinal' | 'isCancelled'>): BoardColumnKind => {
  if (status.isCancelled) return 'cancelled';
  if (status.isFinal) return 'final';
  return 'open';
};

const KIND_ORDER: Record<BoardColumnKind, number> = { open: 0, final: 1, cancelled: 2 };

/**
 * Column order without a stored position: open statuses first (oldest first,
 * so a later "In review" lands after "In progress"), then finished, then
 * cancelled. Statuses without `createdAt` keep their incoming order.
 */
export const orderBoardStatuses = (statuses: Status[]): Status[] => (
  statuses
    .map((status, index) => ({ status, index }))
    .sort((left, right) => {
      const byKind = KIND_ORDER[columnKind(left.status)] - KIND_ORDER[columnKind(right.status)];
      if (byKind !== 0) return byKind;
      const leftCreated = left.status.createdAt ?? '';
      const rightCreated = right.status.createdAt ?? '';
      if (leftCreated && rightCreated && leftCreated !== rightCreated) {
        return leftCreated < rightCreated ? -1 : 1;
      }
      return left.index - right.index;
    })
    .map(({ status }) => status)
);

/**
 * One card per repeat series and status: a "never ending" series has a year of
 * open occurrences, and the board must not show 365 copies of a daily task.
 * The card is the current or next occurrence; when the whole series in that
 * status lies in the past, the latest one.
 */
export const collapseRepeatSeries = (tasks: Task[], today: string): Task[] => {
  const picked = new Map<string, Task>();
  const result: Task[] = [];

  tasks.forEach((task) => {
    if (!task.repeatId) {
      result.push(task);
      return;
    }
    const key = `${task.repeatId}|${task.statusId}`;
    const current = picked.get(key);
    if (!current || isCloserOccurrence(task, current, today)) {
      picked.set(key, task);
    }
  });

  return [...result, ...picked.values()];
};

const isCloserOccurrence = (candidate: Task, current: Task, today: string): boolean => {
  const candidateUpcoming = candidate.endDate >= today;
  const currentUpcoming = current.endDate >= today;
  if (candidateUpcoming !== currentUpcoming) return candidateUpcoming;
  if (candidateUpcoming) return candidate.startDate < current.startDate;
  return candidate.endDate > current.endDate;
};

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
const priorityRank = (priority: TaskPriority | null) => (priority ? PRIORITY_RANK[priority] : 3);

/**
 * Open columns: by due date (overdue naturally first), then priority, then
 * title. Finished/cancelled columns: most recently changed first.
 */
export const sortBoardCards = (tasks: Task[], kind: BoardColumnKind): Task[] => (
  [...tasks].sort((left, right) => {
    if (kind !== 'open') {
      const byUpdated = (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '');
      if (byUpdated !== 0) return byUpdated;
    }
    const byDue = left.endDate.localeCompare(right.endDate);
    if (byDue !== 0) return byDue;
    const byPriority = priorityRank(left.priority) - priorityRank(right.priority);
    if (byPriority !== 0) return byPriority;
    return left.title.localeCompare(right.title);
  })
);

export const isBoardTaskOverdue = (task: Pick<Task, 'endDate'>, kind: BoardColumnKind, today: string): boolean => (
  kind === 'open' && task.endDate < today
);

/** Board-only quick filters (not shared with the timeline, not persisted). */
export type BoardQuickFilters = {
  /** Case-insensitive substring of the title; blank means no search. */
  search?: string;
  /** Only open tasks past their end date — finished columns stay empty. */
  overdueOnly?: boolean;
};

const matchesSearch = (task: Task, query: string) => (
  task.title.toLocaleLowerCase().includes(query)
);

const tasksOnBoard = (tasks: Task[], statuses: Status[], scope: TaskBoardScope | null): Task[] => {
  const openStatusIds = new Set(
    statuses.filter((status) => columnKind(status) === 'open').map((status) => status.id),
  );
  return tasks.filter((task) => (
    scope ? isTaskInBoardScope(task, scope) : openStatusIds.has(task.statusId)
  ));
};

/**
 * The board's columns. `tasks` are already filtered (filter panel); the board
 * scope decides which of them belong on the board — while it is still loading
 * (null), only tasks in an open status are shown. A status filter narrows the
 * columns themselves, not just their cards; quick filters narrow the cards.
 */
export const buildBoardColumns = ({
  statuses,
  tasks,
  scope,
  today,
  statusFilterIds = [],
  quick = {},
}: {
  statuses: Status[];
  tasks: Task[];
  scope: TaskBoardScope | null;
  today: string;
  statusFilterIds?: string[];
  quick?: BoardQuickFilters;
}): BoardColumn[] => {
  const visibleStatuses = statusFilterIds.length > 0
    ? statuses.filter((status) => statusFilterIds.includes(status.id))
    : statuses;
  const query = quick.search?.trim().toLocaleLowerCase() ?? '';
  const onBoard = query
    ? tasksOnBoard(tasks, statuses, scope).filter((task) => matchesSearch(task, query))
    : tasksOnBoard(tasks, statuses, scope);

  const tasksByStatus = new Map<string, Task[]>();
  collapseRepeatSeries(onBoard, today).forEach((task) => {
    const list = tasksByStatus.get(task.statusId);
    if (list) list.push(task);
    else tasksByStatus.set(task.statusId, [task]);
  });

  return orderBoardStatuses(visibleStatuses).map((status) => {
    const kind = columnKind(status);
    const columnTasks = tasksByStatus.get(status.id) ?? [];
    const shown = quick.overdueOnly
      ? columnTasks.filter((task) => isBoardTaskOverdue(task, kind, today))
      : columnTasks;
    return {
      status,
      kind,
      tasks: sortBoardCards(shown, kind),
    };
  });
};

/**
 * Open board cards per person — orders the people in the quick-filter row so
 * the busiest come first. Counted before any filter (a click must not reshuffle
 * the row) and after collapsing series (a daily repeat is one card, not 365).
 */
export const countOpenBoardCardsByAssignee = (
  tasks: Task[],
  statuses: Status[],
  scope: TaskBoardScope | null,
  today: string,
): Map<string, number> => {
  const openStatusIds = new Set(
    statuses.filter((status) => columnKind(status) === 'open').map((status) => status.id),
  );
  const counts = new Map<string, number>();
  collapseRepeatSeries(tasksOnBoard(tasks, statuses, scope), today).forEach((task) => {
    if (!openStatusIds.has(task.statusId)) return;
    task.assigneeIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  });
  return counts;
};
