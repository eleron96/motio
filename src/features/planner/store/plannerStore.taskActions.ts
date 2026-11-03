import { createTaskActionHelpers } from '@/features/planner/store/plannerStore.taskActionHelpers';
import { addDays, differenceInDays, format, parseISO } from 'date-fns';
import { clampTaskDates } from '@/features/planner/lib/dateUtils';
import { supabase } from '@/shared/lib/supabaseClient';
import { mapTaskRow } from '@/shared/domain/taskRowMapper';
import { diffRemovedTaskMediaIds } from '@/shared/domain/taskMediaIds';
import { resolveTaskOwnEditsRevert } from '@/shared/domain/taskOwnEdits';
import { sha256Hex } from '@/shared/lib/textHash';
import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';
import type { Task } from '@/features/planner/types/planner';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  mapTaskUpdates,
  pickActiveAssigneeIds,
  TaskRow,
  uniqueAssigneeIds,
} from '@/features/planner/store/plannerStore.helpers';
import {
  beginTaskWrite,
  confirmTaskWrite,
  finishTaskWrite,
  getConfirmedTask,
  isLatestTaskWrite,
  queueTaskWrite,
} from '@/features/planner/store/plannerStore.pendingWrites';

// Tasks themselves: create, edit, delete, duplicate, and search.
type TaskActions = Pick<
  PlannerStore,
  | 'addTask'
  | 'updateTask'
  | 'revertTaskOwnEdits'
  | 'saveTaskDescription'
  | 'deleteTask'
  | 'deleteTasks'
  | 'fetchTaskDescription'
  | 'duplicateTask'
  | 'searchTasks'
>;

// Search results never show the description, so it isn't fetched.
const TASK_SEARCH_COLUMNS = 'id, title, project_id, assignee_id, assignee_ids, start_date, end_date, status_id, type_id, priority, tag_ids, repeat_id, updated_at';
const TASK_SEARCH_LIMIT = 200;

export const createTaskActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): TaskActions => {
  const {
    applyUpdatedRows,
    scheduleTaskMediaCleanup,
    collectTaskMediaIdsForIds,
  } = createTaskActionHelpers(set, get);

  return ({
  addTask: async (task) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return null;

    const assigneeIds = pickActiveAssigneeIds(task.assigneeIds, get().assignees);

    // Final backstop: never persist a task that ends before today or before its
    // own start. Covers every creation path (create dialog, duplicate, …).
    const { startDate, endDate } = clampTaskDates(task.startDate, task.endDate);

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        workspace_id: workspaceId,
        title: task.title,
        project_id: task.projectId,
        assignee_id: assigneeIds[0] ?? null,
        assignee_ids: assigneeIds,
        start_date: startDate,
        end_date: endDate,
        status_id: task.statusId,
        type_id: task.typeId,
        priority: task.priority,
        tag_ids: task.tagIds,
        description: task.description,
        repeat_id: task.repeatId,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return null;
    }

    const mapped = mapTaskRow(data as TaskRow);
    set((state) => ({ tasks: [...state.tasks, mapped] }));
    return mapped;
  },

  updateTask: async (id, updates, scope = 'single') => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    const payload = mapTaskUpdates(updates);
    if (Object.keys(payload).length === 0) return;

    let baseTask = get().tasks.find((task) => task.id === id) ?? null;
    if (!baseTask && scope !== 'single') {
      const { data: baseTaskData, error: baseTaskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();
      if (baseTaskError || !baseTaskData) {
        get().reportTaskWriteFailure('save', 'updateTask', baseTaskError);
        return;
      }
      baseTask = mapTaskRow(baseTaskData as TaskRow);
      set((state) => (
        state.tasks.some((task) => task.id === baseTask!.id)
          ? state
          : { tasks: [...state.tasks, baseTask!] }
      ));
    }

    const removedMediaIds = (
      Object.prototype.hasOwnProperty.call(updates, 'description')
        && typeof baseTask?.description === 'string'
    )
      ? diffRemovedTaskMediaIds(baseTask.description, updates.description ?? null)
      : [];

    const repeatScope = (scope !== 'single' && baseTask?.repeatId)
      ? scope
      : 'single';

    if (repeatScope !== 'single' && baseTask?.repeatId) {
      const query = supabase
        .from('tasks')
        .update(payload)
        .eq('workspace_id', workspaceId)
        .eq('repeat_id', baseTask.repeatId);

      const { data, error } = await (repeatScope === 'following'
        ? query.gte('start_date', baseTask.startDate).select('*')
        : query.select('*'));

      if (error) {
        get().reportTaskWriteFailure('save', 'updateTask', error);
        return;
      }

      applyUpdatedRows((data ?? []) as TaskRow[]);
      scheduleTaskMediaCleanup(removedMediaIds);
      return;
    }

    // A single-task change shows at once (moving a bar no longer snaps back
    // for a round-trip); the write follows, queued behind earlier writes to
    // the same task (plannerStore.pendingWrites). Only the answer to the
    // latest write lands in the store; a failure rolls the task back to what
    // the server last confirmed and shows the usual write-failure toast.
    const seq = beginTaskWrite(id, baseTask);
    if (baseTask) {
      const patch: Partial<Task> = 'assigneeIds' in updates
        ? { ...updates, assigneeIds: uniqueAssigneeIds(updates.assigneeIds) }
        : updates;
      set((state) => ({
        tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
      }));
    }

    await queueTaskWrite(id, async () => {
      const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .select('*')
        .single();

      const latest = isLatestTaskWrite(id, seq);
      if (error || !data) {
        if (latest) {
          const confirmed = getConfirmedTask(id);
          if (confirmed) {
            set((state) => ({
              tasks: state.tasks.map((task) => (task.id === id ? confirmed : task)),
            }));
          }
          const newer = finishTaskWrite(id, seq, confirmed);
          if (newer) get().upsertTasks([newer]);
        }
        get().reportTaskWriteFailure('save', 'updateTask', error);
        return;
      }

      const updated = mapTaskRow(data as TaskRow);
      confirmTaskWrite(id, updated);
      if (latest) {
        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === id ? updated : task)),
        }));
        const newer = finishTaskWrite(id, seq, updated);
        if (newer) get().upsertTasks([newer]);
      }
      scheduleTaskMediaCleanup(removedMediaIds);
    });
  },

  revertTaskOwnEdits: async (id, edits) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    // First try against the task as live sync last delivered it. The write is
    // conditional on that version (`updated_at`): if a teammate saved in the
    // meantime, nothing is written, we re-read the row and decide again —
    // a field they changed after us is then left alone.
    let live = get().tasks.find((task) => task.id === id) ?? null;
    for (let attempt = 0; attempt < 2 && live; attempt += 1) {
      const restore = resolveTaskOwnEditsRevert(edits, live);
      const payload = mapTaskUpdates(restore);
      if (Object.keys(payload).length === 0) return;

      let query = supabase
        .from('tasks')
        .update(payload)
        .eq('id', id)
        .eq('workspace_id', workspaceId);
      if (live.updatedAt) query = query.eq('updated_at', live.updatedAt);

      const { data, error } = await query.select('*');
      if (error) {
        get().reportTaskWriteFailure('save', 'revertTaskOwnEdits', error);
        return;
      }

      const rows = (data ?? []) as TaskRow[];
      if (rows.length > 0) {
        applyUpdatedRows(rows);
        scheduleTaskMediaCleanup(
          'description' in restore && typeof live.description === 'string'
            ? diffRemovedTaskMediaIds(live.description, restore.description ?? null)
            : [],
        );
        return;
      }

      const { data: freshRow, error: freshError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (freshError) {
        get().reportTaskWriteFailure('save', 'revertTaskOwnEdits', freshError);
        return;
      }
      if (!freshRow) return;
      applyUpdatedRows([freshRow as TaskRow]);
      live = mapTaskRow(freshRow as TaskRow);
    }
  },

  saveTaskDescription: async (id, description, baseDescription, options = {}) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return 'failed';

    // Only pictures that were in the text we edited and are gone from ours
    // may be cleaned up — a teammate's pictures never were ours to drop.
    const removedMediaIds = diffRemovedTaskMediaIds(baseDescription ?? '', description);

    // The sandbox has no RPCs; a plain write is the whole story there.
    if (options.force || isDemoRoute()) {
      const { data, error } = await supabase
        .from('tasks')
        .update({ description })
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .select('*');
      const forcedRows = (data ?? []) as TaskRow[];
      if (error || forcedRows.length === 0) {
        // No row back: the task is gone or this person may no longer edit it.
        get().reportTaskWriteFailure('save', 'saveTaskDescription', error ?? { message: 'no row updated' });
        return 'failed';
      }
      applyUpdatedRows(forcedRows);
      scheduleTaskMediaCleanup(removedMediaIds);
      return 'saved';
    }

    const { data, error } = await supabase.rpc('update_task_description_if_unchanged', {
      target_task_id: id,
      expected_description_sha256: await sha256Hex(baseDescription ?? ''),
      new_description: description,
    });
    if (error) {
      get().reportTaskWriteFailure('save', 'saveTaskDescription', error);
      return 'failed';
    }

    const rows = (data ?? []) as TaskRow[];
    if (rows.length === 0) {
      // Nothing written. Either somebody saved another description meanwhile
      // — bring theirs into the store (live sync may not have yet) so the
      // card can offer it — or the row is out of reach (deleted, or editing
      // rights gone), which is a failure, not a teammate's change.
      const { data: freshRow, error: freshError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      const fresh = freshRow as TaskRow | null;
      if (freshError || !fresh || (fresh.description ?? '') === (baseDescription ?? '')) {
        get().reportTaskWriteFailure('save', 'saveTaskDescription', freshError ?? { message: 'no row updated' });
        return 'failed';
      }
      applyUpdatedRows([fresh]);
      return 'conflict';
    }

    applyUpdatedRows(rows);
    scheduleTaskMediaCleanup(removedMediaIds);
    return 'saved';
  },

  deleteTask: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    const previousTasks = get().tasks;
    const previousSelectedTaskId = get().selectedTaskId;
    const previousHighlightedTaskId = get().highlightedTaskId;
    const previousHighlightedTaskRowAssigneeId = get().highlightedTaskRowAssigneeId;

    // Оптимистично снимаем задачу с UI; если DELETE упадёт, откатим стейт.
    get().removeTasksByIds([id]);

    const mediaIds = await collectTaskMediaIdsForIds(workspaceId, [id]);

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) {
      set({
        tasks: previousTasks,
        selectedTaskId: previousSelectedTaskId,
        highlightedTaskId: previousHighlightedTaskId,
        highlightedTaskRowAssigneeId: previousHighlightedTaskRowAssigneeId,
      });
      get().reportTaskWriteFailure('delete', 'deleteTask', error);
      return;
    }

    scheduleTaskMediaCleanup(mediaIds);
  },

  deleteTasks: async (ids) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId || ids.length === 0) return {};
    const uniqueIds = Array.from(new Set(ids));

    const previousTasks = get().tasks;
    const previousSelectedTaskId = get().selectedTaskId;
    const previousHighlightedTaskId = get().highlightedTaskId;
    const previousHighlightedTaskRowAssigneeId = get().highlightedTaskRowAssigneeId;

    get().removeTasksByIds(uniqueIds);

    const mediaIds = await collectTaskMediaIdsForIds(workspaceId, uniqueIds);

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('workspace_id', workspaceId)
      .in('id', uniqueIds);

    if (error) {
      console.error(error);
      set({
        tasks: previousTasks,
        selectedTaskId: previousSelectedTaskId,
        highlightedTaskId: previousHighlightedTaskId,
        highlightedTaskRowAssigneeId: previousHighlightedTaskRowAssigneeId,
      });
      return { error: error.message };
    }

    scheduleTaskMediaCleanup(mediaIds);
    return {};
  },

  fetchTaskDescription: async (taskId) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    const { data, error } = await supabase
      .from('tasks')
      .select('id, description')
      .eq('id', taskId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error || !data) return;

    const row = data as { id: string; description: string | null };
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === row.id ? { ...task, description: row.description } : task,
      ),
    }));
  },

  duplicateTask: async (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task) return;

    const start = parseISO(task.startDate);
    const end = parseISO(task.endDate);
    const duration = differenceInDays(end, start) + 1;
    const newStart = addDays(end, 1);
    const newEnd = addDays(newStart, Math.max(0, duration - 1));

    const duplicate = await get().addTask({
      title: task.title,
      projectId: task.projectId,
      assigneeIds: [...task.assigneeIds],
      startDate: format(newStart, 'yyyy-MM-dd'),
      endDate: format(newEnd, 'yyyy-MM-dd'),
      statusId: task.statusId,
      typeId: task.typeId,
      priority: task.priority,
      tagIds: [...task.tagIds],
      description: task.description ?? null,
      repeatId: null,
    });
    if (!duplicate) get().reportTaskWriteFailure('save', 'duplicateTask', null);
  },

  searchTasks: async (workspaceId, query) => {
    const needle = query.trim();
    if (!needle) return { tasks: [] };
    // `%` and `_` are wildcards in ILIKE: a title with them is searched literally.
    const pattern = `%${needle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const { data, error } = await supabase
      .from('tasks')
      .select(TASK_SEARCH_COLUMNS)
      .eq('workspace_id', workspaceId)
      .ilike('title', pattern)
      .order('start_date', { ascending: true })
      .limit(TASK_SEARCH_LIMIT);

    if (error) {
      return { tasks: [], error: error.message };
    }

    return {
      tasks: ((data ?? []) as unknown as TaskRow[]).map(mapTaskRow),
    };
  },
  });
};
