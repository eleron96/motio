import { supabase } from '@/shared/lib/supabaseClient';
import { mapTaskRow } from '@/shared/domain/taskRowMapper';
import { deferTaskRowIfWriting } from '@/features/planner/store/plannerStore.pendingWrites';
import type { PlannerStore } from '@/features/planner/store/plannerStore.contract';
import { type LoadedTaskWindow, TaskRow } from '@/features/planner/store/plannerStore.helpers';
import type { Task } from '@/features/planner/types/planner';
import { mergeWindowLoad } from '@/shared/domain/taskLoadScopes';

// The rows a task window is made of: the select queries and how a fresh
// answer merges into what is already loaded.

const WINDOW_TASK_COLUMNS = [
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

export const selectWindowTasks = ({ workspaceId, start, end }: LoadedTaskWindow) => supabase
  .from('tasks')
  .select(WINDOW_TASK_COLUMNS)
  .eq('workspace_id', workspaceId)
  .gte('end_date', start)
  .lte('start_date', end);

// Time off IS windowed like tasks (unlike milestones): absences accumulate
// linearly with wall-clock time and nothing ever archives them, so an
// unwindowed query would grow heavier every year on the boot path.
export const selectWindowTimeOff = ({ workspaceId, start, end }: LoadedTaskWindow) => supabase
  .from('time_off')
  .select('id, workspace_id, assignee_id, start_date, end_date, note')
  .eq('workspace_id', workspaceId)
  .gte('end_date', start)
  .lte('start_date', end);

/**
 * Window rows as they enter the cache: a task hidden while its deletion can
 * still be undone stays hidden, and a task with its own write in flight keeps
 * the value on screen (the row is held back and applied after the write if it
 * is newer — plannerStore.pendingWrites).
 */
export const mergeWindowRows = (
  state: PlannerStore,
  rows: TaskRow[],
  board: PlannerStore['boardScope'],
) => {
  const pendingDeleteIds = new Set(state.pendingDeleteTaskIds);
  const existingById = new Map(state.tasks.map((task) => [task.id, task]));
  const incoming: Task[] = [];
  rows.forEach((row) => {
    if (pendingDeleteIds.has(row.id)) return;
    const task = mapTaskRow(row);
    incoming.push(deferTaskRowIfWriting(task) ? existingById.get(task.id) ?? task : task);
  });
  return mergeWindowLoad(state.tasks, incoming, board);
};

/**
 * Counts for the tasks kept in the cache: tasks of the new window get theirs
 * from `windowCounts` (a task without comments is absent there, so zero);
 * the rest keep what they had. `windowCounts` null = not known yet.
 */
export const mergeWindowCommentCounts = (
  previous: Record<string, number>,
  keptTaskIds: ReadonlySet<string>,
  windowTaskIds: readonly string[],
  windowCounts: Record<string, number> | null,
) => {
  const next = Object.fromEntries(
    Object.entries(previous).filter(([taskId]) => keptTaskIds.has(taskId)),
  );
  if (windowCounts) {
    windowTaskIds.forEach((taskId) => {
      next[taskId] = windowCounts[taskId] ?? 0;
    });
  }
  return next;
};
