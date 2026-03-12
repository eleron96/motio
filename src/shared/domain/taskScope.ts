export type TaskScope = 'current' | 'past';

export type PastTaskSort =
  | 'start_desc'
  | 'start_asc'
  | 'end_desc'
  | 'end_asc'
  | 'title_asc'
  | 'title_desc';

type TaskScopeComparable = {
  endDate: string;
};

export const DEFAULT_PAST_TASK_SORT: PastTaskSort = 'end_desc';

export const isTaskInScope = (
  task: TaskScopeComparable,
  taskScope: TaskScope,
  todayKey: string,
) => (
  taskScope === 'current'
    ? task.endDate >= todayKey
    : task.endDate < todayKey
);

export const shouldCollapseRepeatSeriesInTaskScope = (taskScope: TaskScope) => (
  taskScope === 'current'
);
