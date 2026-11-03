import { createTaskActionHelpers } from '@/features/planner/store/plannerStore.taskActionHelpers';
import { supabase } from '@/shared/lib/supabaseClient';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import { mapTaskSubtaskRow, TaskSubtaskRow } from '@/features/planner/store/plannerStore.helpers';

// Subtasks of a task and the pictures they carry.
type SubtaskActions = Pick<
  PlannerStore,
  | 'fetchTaskSubtasks'
  | 'createTaskSubtask'
  | 'createTaskSubtasks'
  | 'updateTaskSubtaskTitle'
  | 'updateTaskSubtaskCompletion'
  | 'updateTaskSubtaskImages'
  | 'updateTaskSubtaskPositions'
  | 'deleteTaskSubtask'
  | 'releaseTaskMedia'
>;

const TASK_SUBTASK_COLUMNS = 'id, task_id, title, is_done, done_at, position, created_at, images';

export const createSubtaskActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): SubtaskActions => {
  const {
    scheduleTaskMediaCleanup,
  } = createTaskActionHelpers(set, get);

  return ({
  fetchTaskSubtasks: async (workspaceId, taskId) => {
    const { data, error } = await supabase
      .from('task_subtasks')
      .select(TASK_SUBTASK_COLUMNS)
      .eq('workspace_id', workspaceId)
      .eq('task_id', taskId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      return { subtasks: [], error: error.message };
    }

    return {
      subtasks: ((data ?? []) as TaskSubtaskRow[]).map(mapTaskSubtaskRow),
    };
  },

  createTaskSubtask: async (workspaceId, taskId, title, position, images = []) => {
    const { data, error } = await supabase
      .from('task_subtasks')
      .insert({
        workspace_id: workspaceId,
        task_id: taskId,
        title,
        is_done: false,
        done_at: null,
        position,
        ...(images.length > 0 ? { images } : {}),
      })
      .select(TASK_SUBTASK_COLUMNS)
      .single();

    if (error || !data) {
      return { error: error?.message ?? 'Failed to create subtask.' };
    }

    return { subtask: mapTaskSubtaskRow(data as TaskSubtaskRow) };
  },

  createTaskSubtasks: async (workspaceId, taskId, titles, images) => {
    if (titles.length === 0) return {};

    const { error } = await supabase
      .from('task_subtasks')
      .insert(titles.map((title, index) => ({
        workspace_id: workspaceId,
        task_id: taskId,
        title,
        is_done: false,
        done_at: null,
        position: index,
        ...(images?.[index]?.length ? { images: images[index] } : {}),
      })));

    if (error) {
      return { error: error.message };
    }

    return {};
  },

  updateTaskSubtaskTitle: async (workspaceId, taskId, subtaskId, title) => {
    const { error } = await supabase
      .from('task_subtasks')
      .update({ title })
      .eq('workspace_id', workspaceId)
      .eq('task_id', taskId)
      .eq('id', subtaskId);

    if (error) {
      return { error: error.message };
    }

    return {};
  },

  updateTaskSubtaskCompletion: async (workspaceId, taskId, subtaskId, isDone, doneAt) => {
    const { error } = await supabase
      .from('task_subtasks')
      .update({
        is_done: isDone,
        done_at: doneAt,
      })
      .eq('workspace_id', workspaceId)
      .eq('task_id', taskId)
      .eq('id', subtaskId);

    if (error) {
      return { error: error.message };
    }

    return {};
  },

  updateTaskSubtaskImages: async (workspaceId, taskId, subtaskId, images) => {
    const { error } = await supabase
      .from('task_subtasks')
      .update({ images })
      .eq('workspace_id', workspaceId)
      .eq('task_id', taskId)
      .eq('id', subtaskId);

    if (error) {
      return { error: error.message };
    }

    return {};
  },

  updateTaskSubtaskPositions: async (workspaceId, taskId, updates) => {
    if (updates.length === 0) return {};
    // One row per write: a subtask list is short, and an upsert would need
    // every not-null column of the row.
    const results = await Promise.all(updates.map(({ id, position }) => (
      supabase
        .from('task_subtasks')
        .update({ position })
        .eq('workspace_id', workspaceId)
        .eq('task_id', taskId)
        .eq('id', id)
    )));
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      return { error: failed.error.message };
    }

    return {};
  },

  releaseTaskMedia: (mediaIds) => {
    scheduleTaskMediaCleanup(mediaIds);
  },

  deleteTaskSubtask: async (workspaceId, taskId, subtaskId) => {
    const { error } = await supabase
      .from('task_subtasks')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('task_id', taskId)
      .eq('id', subtaskId);

    if (error) {
      return { error: error.message };
    }

    return {};
  },
  });
};
