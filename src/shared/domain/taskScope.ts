export type TaskScope = 'current' | 'past';

export type PastTaskSort =
  | 'start_desc'
  | 'start_asc'
  | 'end_desc'
  | 'end_asc'
  | 'title_asc'
  | 'title_desc';

export const DEFAULT_PAST_TASK_SORT: PastTaskSort = 'end_desc';

export const shouldCollapseRepeatSeriesInTaskScope = (taskScope: TaskScope) => (
  taskScope === 'current'
);
