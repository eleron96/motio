import { format } from 'date-fns';
import { Task } from '@/features/planner/types/planner';
import { supabase } from '@/shared/lib/supabaseClient';
import { isAbortError, withAbortSignal } from '@/shared/lib/latestAsyncRequest';
import { mapTaskRow, type TaskMappedRow } from '@/shared/domain/taskRowMapper';
import type { PastTaskSort, TaskScope } from '@/shared/domain/taskScope';

type FetchProjectTasksParams = {
  workspaceId: string;
  projectId: string;
  taskScope: TaskScope;
  pastFromDate: string;
  pastToDate: string;
  pastSort: PastTaskSort;
  statusFilterIds: string[];
  assigneeFilterIds: string[];
  search: string;
  pageIndex: number;
  pageSize: number;
  signal?: AbortSignal;
};

type TaskRow = TaskMappedRow;

type ProjectAssigneeRow = {
  assignee_id: string | null;
  assignee_ids: string[] | null;
};

export type FetchProjectTasksResult = {
  tasks: Task[];
  totalCount: number;
  availableAssigneeIds: string[];
};

const TASK_COLUMNS = [
  'id',
  'title',
  'project_id',
  'assignee_id',
  'assignee_ids',
  'start_date',
  'end_date',
  'status_id',
  'type_id',
  'priority',
  'tag_ids',
  'description',
  'repeat_id',
].join(',');

const applyScopeFilters = <TQuery extends {
  gte: (column: string, value: string) => TQuery;
  lt: (column: string, value: string) => TQuery;
  lte: (column: string, value: string) => TQuery;
}>(
  query: TQuery,
  taskScope: TaskScope,
  today: string,
  pastFromDate: string,
  pastToDate: string,
) => {
  if (taskScope === 'current') {
    return query.gte('end_date', today);
  }

  let nextQuery = query.lt('end_date', today);
  if (pastFromDate) {
    nextQuery = nextQuery.gte('end_date', pastFromDate);
  }
  if (pastToDate) {
    nextQuery = nextQuery.lte('start_date', pastToDate);
  }
  return nextQuery;
};

const applySharedTaskFilters = <TQuery extends {
  in: (column: string, values: string[]) => TQuery;
  ilike: (column: string, value: string) => TQuery;
  or: (filters: string) => TQuery;
}>(
  query: TQuery,
  statusFilterIds: string[],
  assigneeFilterIds: string[],
  search: string,
) => {
  let nextQuery = query;

  if (statusFilterIds.length > 0) {
    nextQuery = nextQuery.in('status_id', statusFilterIds);
  }

  if (assigneeFilterIds.length > 0) {
    const assigneeFilter = assigneeFilterIds
      .flatMap((assigneeId) => [
        `assignee_id.eq.${assigneeId}`,
        `assignee_ids.cs.{${assigneeId}}`,
      ])
      .join(',');
    nextQuery = nextQuery.or(assigneeFilter);
  }

  if (search.trim()) {
    nextQuery = nextQuery.ilike('title', `%${search.trim()}%`);
  }

  return nextQuery;
};

const applyTaskOrdering = <TQuery extends {
  order: (column: string, options: { ascending: boolean }) => TQuery;
}>(
  query: TQuery,
  taskScope: TaskScope,
  pastSort: PastTaskSort,
) => {
  if (taskScope === 'current') {
    return query.order('start_date', { ascending: true });
  }

  switch (pastSort) {
    case 'start_asc':
      return query.order('start_date', { ascending: true });
    case 'start_desc':
      return query.order('start_date', { ascending: false });
    case 'end_asc':
      return query.order('end_date', { ascending: true });
    case 'end_desc':
      return query.order('end_date', { ascending: false });
    case 'title_asc':
      return query.order('title', { ascending: true });
    case 'title_desc':
      return query.order('title', { ascending: false });
    default:
      return query.order('end_date', { ascending: false });
  }
};

const extractAvailableAssigneeIds = (rows: ProjectAssigneeRow[]) => {
  const ids = new Set<string>();
  rows.forEach((row) => {
    if (row.assignee_id) {
      ids.add(row.assignee_id);
    }
    row.assignee_ids?.forEach((assigneeId) => ids.add(assigneeId));
  });
  return Array.from(ids);
};

export const fetchProjectTasks = async ({
  workspaceId,
  projectId,
  taskScope,
  pastFromDate,
  pastToDate,
  pastSort,
  statusFilterIds,
  assigneeFilterIds,
  search,
  pageIndex,
  pageSize,
  signal,
}: FetchProjectTasksParams): Promise<FetchProjectTasksResult> => {
  const offset = (pageIndex - 1) * pageSize;
  const today = format(new Date(), 'yyyy-MM-dd');

  let assigneeQuery = supabase
    .from('tasks')
    .select('assignee_id,assignee_ids')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId);
  assigneeQuery = applyScopeFilters(assigneeQuery, taskScope, today, pastFromDate, pastToDate);
  assigneeQuery = applySharedTaskFilters(assigneeQuery, statusFilterIds, [], search);
  assigneeQuery = withAbortSignal(assigneeQuery, signal);

  let taskQuery = supabase
    .from('tasks')
    .select(TASK_COLUMNS, { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId);
  taskQuery = applyScopeFilters(taskQuery, taskScope, today, pastFromDate, pastToDate);
  taskQuery = applySharedTaskFilters(taskQuery, statusFilterIds, assigneeFilterIds, search);
  taskQuery = applyTaskOrdering(taskQuery, taskScope, pastSort);
  taskQuery = withAbortSignal(taskQuery, signal);

  let assigneeRows: ProjectAssigneeRow[] | null = null;
  let taskRows: unknown[] | null = null;
  let taskCount: number | null = null;
  let taskError: { message: string } | null = null;

  try {
    const [assigneeResponse, taskResponse] = await Promise.all([
      assigneeQuery,
      taskScope === 'current'
        ? taskQuery
        : taskQuery.range(offset, offset + pageSize - 1),
    ]);
    assigneeRows = assigneeResponse.data as ProjectAssigneeRow[] | null;
    taskRows = taskResponse.data;
    taskCount = taskResponse.count;
    taskError = taskResponse.error;

    if (assigneeResponse.error) {
      throw new Error(assigneeResponse.error.message);
    }
  } catch (queryError) {
    if (isAbortError(queryError)) {
      return {
        tasks: [],
        totalCount: 0,
        availableAssigneeIds: [],
      };
    }
    throw queryError;
  }

  if (taskError) {
    if (isAbortError(taskError)) {
      return {
        tasks: [],
        totalCount: 0,
        availableAssigneeIds: [],
      };
    }
    throw new Error(taskError.message);
  }

  const tasks = (taskRows ?? []).map((row) => mapTaskRow(row as TaskRow));

  return {
    tasks,
    totalCount: taskScope === 'current'
      ? tasks.length
      : (typeof taskCount === 'number' ? taskCount : 0),
    availableAssigneeIds: extractAvailableAssigneeIds(assigneeRows ?? []),
  };
};
