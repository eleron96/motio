import { format } from 'date-fns';
import { Task } from '@/features/planner/types/planner';
import { supabase } from '@/shared/lib/supabaseClient';
import { isAbortError, withAbortSignal } from '@/shared/lib/latestAsyncRequest';
import { mapTaskRow, type TaskMappedRow } from '@/shared/domain/taskRowMapper';

type PastSort = 'start_desc' | 'start_asc' | 'end_desc' | 'end_asc' | 'title_asc' | 'title_desc';
type TaskScope = 'current' | 'past';

type FetchAssigneeTasksParams = {
  workspaceId: string;
  assigneeId: string;
  taskScope: TaskScope;
  pastFromDate: string;
  pastToDate: string;
  pastSort: PastSort;
  statusFilterIds: string[];
  projectFilterIds: string[];
  search: string;
  pageIndex: number;
  pageSize: number;
  signal?: AbortSignal;
};

type FetchAssigneeTasksResult = {
  tasks: Task[];
  totalCount: number;
};

type TaskRow = TaskMappedRow;

export const fetchAssigneeTasks = async ({
  workspaceId,
  assigneeId,
  taskScope,
  pastFromDate,
  pastToDate,
  pastSort,
  statusFilterIds,
  projectFilterIds,
  search,
  pageIndex,
  pageSize,
  signal,
}: FetchAssigneeTasksParams): Promise<FetchAssigneeTasksResult | null> => {
  const offset = (pageIndex - 1) * pageSize;
  let query = supabase
    .from('tasks')
    .select([
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
    ].join(','), { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .or(`assignee_id.eq.${assigneeId},assignee_ids.cs.{${assigneeId}}`);

  const today = format(new Date(), 'yyyy-MM-dd');
  if (taskScope === 'current') {
    query = query.gte('end_date', today);
  } else {
    query = query.lt('end_date', today);
    if (pastFromDate) {
      query = query.gte('end_date', pastFromDate);
    }
    if (pastToDate) {
      query = query.lte('start_date', pastToDate);
    }
  }

  if (statusFilterIds.length > 0) {
    query = query.in('status_id', statusFilterIds);
  }
  if (projectFilterIds.length > 0) {
    query = query.in('project_id', projectFilterIds);
  }
  if (search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`);
  }

  let sortedQuery = query;
  if (taskScope === 'past') {
    switch (pastSort) {
      case 'start_asc':
        sortedQuery = sortedQuery.order('start_date', { ascending: true });
        break;
      case 'start_desc':
        sortedQuery = sortedQuery.order('start_date', { ascending: false });
        break;
      case 'end_asc':
        sortedQuery = sortedQuery.order('end_date', { ascending: true });
        break;
      case 'end_desc':
        sortedQuery = sortedQuery.order('end_date', { ascending: false });
        break;
      case 'title_asc':
        sortedQuery = sortedQuery.order('title', { ascending: true });
        break;
      case 'title_desc':
        sortedQuery = sortedQuery.order('title', { ascending: false });
        break;
      default:
        sortedQuery = sortedQuery.order('end_date', { ascending: false });
    }
  } else {
    sortedQuery = sortedQuery.order('start_date', { ascending: true });
  }

  sortedQuery = withAbortSignal(sortedQuery, signal);
  const { data, error, count } = taskScope === 'current'
    ? await sortedQuery
    : await sortedQuery.range(offset, offset + pageSize - 1);

  if (error) {
    if (isAbortError(error)) return null;
    throw new Error(error.message);
  }

  const tasks = (data ?? []).map((row) => mapTaskRow(row as TaskRow));
  return {
    tasks,
    totalCount: taskScope === 'current'
      ? tasks.length
      : (typeof count === 'number' ? count : 0),
  };
};
