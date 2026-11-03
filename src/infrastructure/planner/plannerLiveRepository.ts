import { supabase } from '@/shared/lib/supabaseClient';
import { mapTaskRow, type TaskMappedRow } from '@/shared/domain/taskRowMapper';
import type { Task } from '@/features/planner/types/planner';
import type { MilestoneRow, TimeOffRow } from '@/features/planner/store/plannerStore.helpers';

/**
 * Reads behind the planner's live sync (`usePlannerLiveSync`): the rows a
 * realtime event points at, and the "what changed since" snapshot a reconcile
 * compares the local cache against. Tasks come back mapped; milestones and
 * absences as rows, mapped by the planner store's own mappers.
 */

type ReadResult<T> = { data: T } | { error: string };

type DateWindow = { start: string; end: string };

const TASK_SELECT = [
  'id',
  'workspace_id',
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
  'repeat_ends',
  'created_at',
  'updated_at',
].join(',');

const MILESTONE_SELECT = [
  'id',
  'workspace_id',
  'title',
  'project_id',
  'date',
  'note',
  'status_override',
  'include_in_workload',
  'updated_at',
].join(',');

const DELTA_LIMIT = 1000;

const toTasks = (data: unknown): Task[] => (
  ((data ?? []) as TaskMappedRow[]).map(mapTaskRow)
);

const toIds = (data: unknown): string[] => (
  ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
);

/** Tasks by id; an id missing from the answer was deleted or is no longer visible. */
export const fetchTasksByIds = async (
  workspaceId: string,
  ids: string[],
): Promise<ReadResult<Task[]>> => {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('workspace_id', workspaceId)
    .in('id', ids);
  if (error) return { error: error.message };
  return { data: toTasks(data) };
};

/** Milestones by id; an id missing from the answer was deleted. */
export const fetchMilestoneRowsByIds = async (
  workspaceId: string,
  ids: string[],
): Promise<ReadResult<MilestoneRow[]>> => {
  const { data, error } = await supabase
    .from('milestones')
    .select(MILESTONE_SELECT)
    .eq('workspace_id', workspaceId)
    .in('id', ids);
  if (error) return { error: error.message };
  return { data: (data ?? []) as unknown as MilestoneRow[] };
};

/** Absences that overlap the window. */
export const fetchTimeOffRowsInWindow = async (
  workspaceId: string,
  window: DateWindow,
): Promise<ReadResult<TimeOffRow[]>> => {
  const { data, error } = await supabase
    .from('time_off')
    .select('id, workspace_id, assignee_id, start_date, end_date, note')
    .eq('workspace_id', workspaceId)
    .gte('end_date', window.start)
    .lte('start_date', window.end);
  if (error) return { error: error.message };
  return { data: (data ?? []) as TimeOffRow[] };
};

export interface PlannerChanges {
  /** Window tasks changed since `since.tasks`. */
  changedTasks: Task[];
  /** Milestones changed since `since.milestones`; milestones are not windowed. */
  changedMilestones: MilestoneRow[];
  /** Every task in the window right now. */
  windowTaskIds: string[];
  /** Every milestone in the workspace right now. */
  milestoneIds: string[];
  /** Tasks whose comments changed since `since.comments`. */
  commentedTaskIds: string[];
}

/**
 * What changed in the workspace window since the last reconcile, plus the
 * current id lists that tell deleted rows apart. Five reads in parallel; the
 * first failure fails the whole snapshot.
 */
export const fetchPlannerChanges = async (
  workspaceId: string,
  window: DateWindow,
  since: { tasks: string; milestones: string; comments: string },
): Promise<ReadResult<PlannerChanges>> => {
  const [taskDelta, milestoneDelta, taskIds, milestoneIds, commentDelta] = await Promise.all([
    supabase
      .from('tasks')
      .select(TASK_SELECT)
      .eq('workspace_id', workspaceId)
      .gt('updated_at', since.tasks)
      .gte('end_date', window.start)
      .lte('start_date', window.end)
      .order('updated_at', { ascending: true })
      .limit(DELTA_LIMIT),
    supabase
      .from('milestones')
      .select(MILESTONE_SELECT)
      .eq('workspace_id', workspaceId)
      .gt('updated_at', since.milestones)
      .order('updated_at', { ascending: true })
      .limit(DELTA_LIMIT),
    supabase
      .from('tasks')
      .select('id')
      .eq('workspace_id', workspaceId)
      .gte('end_date', window.start)
      .lte('start_date', window.end),
    supabase
      .from('milestones')
      .select('id')
      .eq('workspace_id', workspaceId),
    supabase
      .from('task_comments')
      .select('task_id,updated_at')
      .eq('workspace_id', workspaceId)
      .gt('updated_at', since.comments)
      .order('updated_at', { ascending: true })
      .limit(DELTA_LIMIT),
  ]);

  const error = taskDelta.error
    ?? milestoneDelta.error
    ?? taskIds.error
    ?? milestoneIds.error
    ?? commentDelta.error;
  if (error) return { error: error.message };

  return {
    data: {
      changedTasks: toTasks(taskDelta.data),
      changedMilestones: (milestoneDelta.data ?? []) as unknown as MilestoneRow[],
      windowTaskIds: toIds(taskIds.data),
      milestoneIds: toIds(milestoneIds.data),
      commentedTaskIds: ((commentDelta.data ?? []) as Array<{ task_id: unknown }>)
        .map((row) => row.task_id)
        .filter((taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0),
    },
  };
};
