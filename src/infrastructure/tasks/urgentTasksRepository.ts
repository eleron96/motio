import { format } from 'date-fns';
import { supabase } from '@/shared/lib/supabaseClient';
import { mapTaskRow, type TaskMappedRow } from '@/shared/domain/taskRowMapper';
import type { Task } from '@/features/planner/types/planner';

type FetchUrgentTasksParams = {
  workspaceId: string;
  assigneeId: string;
  nonFinalStatusIds: string[];
};

export const fetchUrgentTasks = async ({
  workspaceId,
  assigneeId,
  nonFinalStatusIds,
}: FetchUrgentTasksParams): Promise<Task[]> => {
  const today = format(new Date(), 'yyyy-MM-dd');

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
    .or(`assignee_id.eq.${assigneeId},assignee_ids.cs.{${assigneeId}}`)
    .lte('end_date', today)
    .order('end_date', { ascending: true });

  if (nonFinalStatusIds.length > 0) {
    query = query.in('status_id', nonFinalStatusIds);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => mapTaskRow(row as TaskMappedRow));
};
