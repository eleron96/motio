import { supabase } from '@/shared/lib/supabaseClient';
import { mapTaskRow, type TaskMappedRow } from '@/shared/domain/taskRowMapper';
import type { TaskBoardScope } from '@/shared/domain/taskLoadScopes';
import type { Task } from '@/features/planner/types/planner';

// Same columns as the timeline window load: the board shares the task cache,
// so its rows must be interchangeable with window rows (no description here
// either — the task panel fetches it on open).
const BOARD_TASK_COLUMNS = [
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
  'repeat_id',
  'repeat_ends',
  'created_at',
  'updated_at',
].join(',');

export type BoardTasksResult = { data: Task[] } | { error: string };

/**
 * Every task the board scope claims, regardless of dates: tasks in an open
 * status plus tasks changed since `recentlySince`. Two queries rather than one
 * `or(...)` filter so each can use its own index; rows present in both are
 * de-duplicated by id.
 */
export const fetchBoardTasks = async (scope: TaskBoardScope): Promise<BoardTasksResult> => {
  const openQuery = scope.openStatusIds.length > 0
    ? supabase
        .from('tasks')
        .select(BOARD_TASK_COLUMNS)
        .eq('workspace_id', scope.workspaceId)
        .in('status_id', scope.openStatusIds)
    : Promise.resolve({ data: [] as unknown[], error: null });
  const recentQuery = supabase
    .from('tasks')
    .select(BOARD_TASK_COLUMNS)
    .eq('workspace_id', scope.workspaceId)
    .gte('updated_at', scope.recentlySince);

  const [openRes, recentRes] = await Promise.all([openQuery, recentQuery]);
  const error = openRes.error ?? recentRes.error;
  if (error) return { error: error.message };

  const byId = new Map<string, Task>();
  [...(openRes.data ?? []), ...(recentRes.data ?? [])].forEach((row) => {
    const task = mapTaskRow(row as unknown as TaskMappedRow);
    byId.set(task.id, task);
  });
  return { data: Array.from(byId.values()) };
};

/** Ids the board scope claims right now — the reconcile pass drops local leftovers. */
export const fetchBoardTaskIds = async (scope: TaskBoardScope): Promise<{ data: string[] } | { error: string }> => {
  const openQuery = scope.openStatusIds.length > 0
    ? supabase
        .from('tasks')
        .select('id')
        .eq('workspace_id', scope.workspaceId)
        .in('status_id', scope.openStatusIds)
    : Promise.resolve({ data: [] as Array<{ id: string }>, error: null });
  const recentQuery = supabase
    .from('tasks')
    .select('id')
    .eq('workspace_id', scope.workspaceId)
    .gte('updated_at', scope.recentlySince);

  const [openRes, recentRes] = await Promise.all([openQuery, recentQuery]);
  const error = openRes.error ?? recentRes.error;
  if (error) return { error: error.message };

  const ids = new Set<string>();
  [...(openRes.data ?? []), ...(recentRes.data ?? [])].forEach((row) => {
    ids.add((row as { id: string }).id);
  });
  return { data: Array.from(ids) };
};

/**
 * Tasks changed since `since`, workspace-wide: the board has no date window,
 * so its reconcile delta cannot reuse the window-bounded query.
 */
export const fetchTaskDeltaSince = async (
  workspaceId: string,
  since: string,
): Promise<BoardTasksResult> => {
  const { data, error } = await supabase
    .from('tasks')
    .select(BOARD_TASK_COLUMNS)
    .eq('workspace_id', workspaceId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(1000);
  if (error) return { error: error.message };
  return { data: (data ?? []).map((row) => mapTaskRow(row as unknown as TaskMappedRow)) };
};
