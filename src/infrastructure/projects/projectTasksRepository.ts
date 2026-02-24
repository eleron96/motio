import { Task } from '@/features/planner/types/planner';
import { supabase } from '@/shared/lib/supabaseClient';
import { isAbortError, withAbortSignal } from '@/shared/lib/latestAsyncRequest';
import { mapTaskRow, type TaskMappedRow } from '@/shared/domain/taskRowMapper';

type FetchProjectTasksParams = {
  workspaceId: string;
  projectId: string;
  signal?: AbortSignal;
};

type TaskRow = TaskMappedRow;

export const fetchProjectTasks = async ({
  workspaceId,
  projectId,
  signal,
}: FetchProjectTasksParams): Promise<Task[]> => {
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
    ].join(','))
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .order('start_date', { ascending: true });
  query = withAbortSignal(query, signal);
  const { data, error } = await query;
  if (error) {
    if (isAbortError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapTaskRow(row as TaskRow));
};
