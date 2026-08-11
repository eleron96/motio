import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInDays,
  format,
  parseISO,
} from 'date-fns';
import { clampTaskDates } from '@/features/planner/lib/dateUtils';
import { supabase } from '@/shared/lib/supabaseClient';
import { mapTaskRow, normalizeAssigneeIds } from '@/shared/domain/taskRowMapper';
import { buildShiftedRepeatTasks } from '@/shared/domain/repeatTaskMove';
import { buildRepeatSeriesRebuildPlan } from '@/shared/domain/repeatSeriesRebuild';
import {
  diffRemovedTaskMediaIds,
  extractTaskMediaIds,
} from '@/shared/domain/taskMediaIds';
import {
  deleteTaskMediaBatch,
  filterOrphanTaskMediaIds,
} from '@/infrastructure/tasks/taskMediaRepository';
import {
  buildDateUndoRow,
  buildDetachUndoRow,
  buildFieldUndoRow,
  classifyDateChange,
  TaskUndoFieldValue,
} from '@/shared/domain/taskUndo';
import type { Task } from '@/features/planner/types/planner';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  mapTaskSubtaskRow,
  mapTaskUpdates,
  pickActiveAssigneeIds,
  TaskSubtaskRow,
  TaskRow,
  uniqueAssigneeIds,
} from '@/features/planner/store/plannerStore.helpers';

type TaskActions = Pick<
  PlannerStore,
  | 'addTask'
  | 'updateTask'
  | 'updateTaskWithUndo'
  | 'deleteTask'
  | 'deleteTasks'
  | 'duplicateTask'
  | 'createRepeats'
  | 'updateRepeatSeries'
  | 'moveTask'
  | 'moveTaskDetached'
  | 'reassignTask'
  | 'deleteTaskSeries'
  | 'removeAssigneeFromTask'
  | 'fetchTaskSubtasks'
  | 'createTaskSubtask'
  | 'createTaskSubtasks'
  | 'updateTaskSubtaskCompletion'
  | 'updateTaskSubtaskTitle'
  | 'deleteTaskSubtask'
  | 'fetchTaskDescription'
>;

export const createTaskActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): TaskActions => {
  const applyUpdatedRows = (rows: TaskRow[]) => {
    if (rows.length === 0) return;
    const updatedById = new Map(rows.map((row) => [row.id, mapTaskRow(row)]));
    set((state) => ({
      tasks: state.tasks.map((task) => updatedById.get(task.id) ?? task),
    }));
  };

  /**
   * Resync the in-memory store with the real DB state of a repeat series after a
   * mid-operation failure left the two diverged. Refetches every row for the
   * repeat_id, replaces matching store rows, drops series rows that no longer
   * exist, and appends rows created since. Best-effort: logs and bails on error.
   */
  const reconcileSeriesFromDb = async (workspaceId: string, repeatId: string) => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('repeat_id', repeatId);
    if (error) {
      console.error(error);
      return;
    }
    const freshRows = (data ?? []) as TaskRow[];
    const freshById = new Map(freshRows.map((row) => [row.id, mapTaskRow(row)]));
    const freshIds = new Set(freshById.keys());
    set((state) => {
      const existingIds = new Set(state.tasks.map((task) => task.id));
      const reconciled = state.tasks
        .filter((task) => task.repeatId !== repeatId || freshIds.has(task.id))
        .map((task) => freshById.get(task.id) ?? task);
      const appended = freshRows
        .filter((row) => !existingIds.has(row.id))
        .map(mapTaskRow);
      return { tasks: [...reconciled, ...appended] };
    });
  };

  /**
   * Fire-and-forget deletion of task-media blobs whose IDs are no longer
   * referenced by any task in the current state. Called after DB mutations
   * succeed. Never blocks the caller — media cleanup is best-effort GC.
   */
  const makeUndoId = () => (
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  /**
   * Push an undo entry for a single-task date change — but only if the update
   * actually landed: `updateTask` swallows failures, so the store row must
   * already show the requested dates before we promise an undo for them.
   */
  const recordSingleMoveUndo = (
    workspaceId: string,
    before: Task,
    startDate: string,
    endDate: string,
  ) => {
    if (before.startDate === startDate && before.endDate === endDate) return;
    const current = get().tasks.find((task) => task.id === before.id);
    if (!current || current.startDate !== startDate || current.endDate !== endDate) return;
    get().pushTaskUndo({
      id: makeUndoId(),
      workspaceId,
      kind: classifyDateChange(before, { startDate, endDate }),
      rows: [buildDateUndoRow(before.id, before, { startDate, endDate })],
    });
  };

  const scheduleTaskMediaCleanup = (candidateMediaIds: string[]) => {
    if (candidateMediaIds.length === 0) return;
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;
    // Стор — лишь видимый срез таймлайна, поэтому по нему делаем только
    // дешёвый префильтр (попадание = точно используется). Финальное слово —
    // за БД: дубликат задачи вне загруженного диапазона может ссылаться на
    // тот же блоб, и клиент об этом не знает.
    const locallyOrphaned = candidateMediaIds.filter((mediaId) => (
      !get().tasks.some((task) => (
        typeof task.description === 'string'
          && extractTaskMediaIds(task.description).includes(mediaId)
      ))
    ));
    if (locallyOrphaned.length === 0) return;
    void filterOrphanTaskMediaIds(workspaceId, locallyOrphaned)
      .then((orphanIds) => {
        if (orphanIds.length > 0) void deleteTaskMediaBatch(orphanIds);
      })
      .catch(() => {});
  };

  /**
   * Fetch descriptions for the given task IDs and return every task-media
   * ID referenced inside them. Used before bulk task deletion to know which
   * media blobs to GC. Falls back to the in-memory store if the fetch fails.
   */
  const collectTaskMediaIdsForIds = async (
    workspaceId: string,
    taskIds: string[],
  ): Promise<string[]> => {
    if (taskIds.length === 0) return [];

    const { data, error } = await supabase
      .from('tasks')
      .select('description')
      .eq('workspace_id', workspaceId)
      .in('id', taskIds);

    if (error) {
      const fallback = get().tasks
        .filter((task) => taskIds.includes(task.id))
        .map((task) => (typeof task.description === 'string' ? task.description : null));
      return Array.from(new Set(fallback.flatMap((html) => extractTaskMediaIds(html))));
    }

    const descriptions = ((data ?? []) as Array<{ description: string | null }>)
      .map((row) => row.description);
    return Array.from(new Set(descriptions.flatMap((html) => extractTaskMediaIds(html))));
  };

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
        console.error(baseTaskError);
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
        console.error(error);
        return;
      }

      applyUpdatedRows((data ?? []) as TaskRow[]);
      scheduleTaskMediaCleanup(removedMediaIds);
      return;
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('*')
      .single();

    if (error || !data) {
      console.error(error);
      return;
    }

    const updated = mapTaskRow(data as TaskRow);
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? updated : task)),
    }));
    scheduleTaskMediaCleanup(removedMediaIds);
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
      console.error(error);
      set({
        tasks: previousTasks,
        selectedTaskId: previousSelectedTaskId,
        highlightedTaskId: previousHighlightedTaskId,
        highlightedTaskRowAssigneeId: previousHighlightedTaskRowAssigneeId,
      });
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

    await get().addTask({
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
  },

  createRepeats: async (id, options) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    let task = get().tasks.find((item) => item.id === id);
    if (!task) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();

      if (error || !data) {
        return { error: error?.message ?? 'Task not found.' };
      }

      const fetchedTask = mapTaskRow(data as TaskRow);
      task = fetchedTask;
      set((state) => (
        state.tasks.some((item) => item.id === fetchedTask.id)
          ? state
          : { tasks: [...state.tasks, fetchedTask] }
      ));
    }

    const repeatId = task.repeatId ?? (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

    if (!task.repeatId) {
      const { data: repeatData, error: repeatError } = await supabase
        .from('tasks')
        .update({ repeat_id: repeatId, repeat_ends: options.ends })
        .eq('id', task.id)
        .eq('workspace_id', workspaceId)
        .select('*')
        .single();

      if (repeatError || !repeatData) {
        return { error: repeatError?.message ?? 'Failed to link repeat series.' };
      }

      const updatedTask = mapTaskRow(repeatData as TaskRow);
      set((state) => ({
        tasks: state.tasks.map((item) => (item.id === task!.id ? updatedTask : item)),
      }));
    }

    const baseStart = parseISO(task.startDate);
    const baseEnd = parseISO(task.endDate);
    const duration = differenceInDays(baseEnd, baseStart) + 1;
    const assigneeIds = pickActiveAssigneeIds(task.assigneeIds, get().assignees);

    const { data: existingRepeats, error: existingRepeatsError } = await supabase
      .from('tasks')
      .select('start_date')
      .eq('workspace_id', workspaceId)
      .eq('repeat_id', repeatId);
    if (existingRepeatsError) {
      console.error(existingRepeatsError);
    }

    const existingRepeatDates = new Set(
      (existingRepeats ?? []).map((item: { start_date: string }) => item.start_date),
    );
    const endsMode = options.ends;
    const targetCount = options.count && options.count > 0 ? options.count : 0;
    const untilDate = options.untilDate ? parseISO(options.untilDate) : null;
    const neverHorizon = addYears(baseStart, 1);

    const addInterval = (date: Date, step: number) => {
      switch (options.frequency) {
        case 'daily':
          return addDays(date, step);
        case 'weekly':
          return addWeeks(date, step);
        case 'biweekly':
          return addWeeks(date, step * 2);
        case 'fourweekly':
          return addWeeks(date, step * 4);
        case 'monthly':
          return addMonths(date, step);
        case 'yearly':
          return addYears(date, step);
        default:
          return addWeeks(date, step);
      }
    };

    type InsertTask = {
      workspace_id: string;
      title: string;
      project_id: string | null;
      assignee_id: string | null;
      assignee_ids: string[];
      start_date: string;
      end_date: string;
      status_id: string;
      type_id: string;
      priority: TaskRow['priority'];
      tag_ids: string[];
      description: string | null;
      repeat_id: string;
      repeat_ends: string;
    };

    const newTasks: InsertTask[] = [];

    // Ограничиваем цикл 500 итерациями: защищаемся от бесконечной генерации series.
    for (let index = 1; index <= 500; index += 1) {
      if (endsMode === 'after' && index > targetCount) break;
      const nextStart = addInterval(baseStart, index);
      if (endsMode === 'on' && untilDate && nextStart > untilDate) break;
      if (endsMode === 'never' && nextStart > neverHorizon) break;

      const startDate = format(nextStart, 'yyyy-MM-dd');
      if (existingRepeatDates.has(startDate)) continue;

      existingRepeatDates.add(startDate);
      const nextEnd = addDays(nextStart, Math.max(0, duration - 1));
      newTasks.push({
        workspace_id: workspaceId,
        title: task.title,
        project_id: task.projectId,
        assignee_id: assigneeIds[0] ?? null,
        assignee_ids: [...assigneeIds],
        start_date: startDate,
        end_date: format(nextEnd, 'yyyy-MM-dd'),
        status_id: task.statusId,
        type_id: task.typeId,
        priority: task.priority,
        tag_ids: [...task.tagIds],
        description: task.description ?? null,
        repeat_id: repeatId,
        repeat_ends: options.ends,
      });
    }

    if (newTasks.length === 0) {
      return { error: 'No repeats created for the selected range.' };
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert(newTasks)
      .select('*');

    if (error) {
      return { error: error.message };
    }

    set((state) => ({
      tasks: [...state.tasks, ...((data ?? []) as TaskRow[]).map(mapTaskRow)],
    }));

    return { created: newTasks.length };
  },

  updateRepeatSeries: async (id, options, scope = 'following') => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    let baseTask = get().tasks.find((task) => task.id === id) ?? null;
    if (!baseTask) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();

      if (error || !data) {
        return { error: error?.message ?? 'Task not found.' };
      }

      baseTask = mapTaskRow(data as TaskRow);
      set((state) => (
        state.tasks.some((task) => task.id === baseTask!.id)
          ? state
          : { tasks: [...state.tasks, baseTask!] }
      ));
    }

    if (!baseTask.repeatId) {
      return { error: 'Task is not part of a repeat series.' };
    }

    const { data: seriesData, error: seriesError } = await supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('repeat_id', baseTask.repeatId);

    if (seriesError) {
      return { error: seriesError.message };
    }

    const seriesRows = ((seriesData ?? []) as TaskRow[])
      .sort((left, right) => left.start_date.localeCompare(right.start_date) || left.id.localeCompare(right.id));
    if (seriesRows.length === 0) {
      return { error: 'Repeat series not found.' };
    }

    const anchorRow = scope === 'all'
      ? seriesRows[0]
      : seriesRows.find((row) => row.id === id);
    if (!anchorRow) {
      return { error: 'Task is not part of the loaded repeat series.' };
    }

    const plan = buildRepeatSeriesRebuildPlan({
      anchorTaskId: anchorRow.id,
      tasks: seriesRows.map((row) => ({
        id: row.id,
        startDate: row.start_date,
        endDate: row.end_date,
      })),
      options,
    });

    // Apply the whole rebuild (updates + tail delete + new occurrences + end-mode
    // sweep) in one atomic RPC. Either the entire series is rebuilt or nothing
    // changes — a mid-way failure can no longer leave the series half-rebuilt in
    // the DB. The function returns the authoritative resulting series so the store
    // reconciles from the truth in a single round-trip.
    const { data: seriesResult, error: rebuildError } = await supabase
      .rpc('rebuild_repeat_series', {
        p_workspace_id: workspaceId,
        p_repeat_id: baseTask.repeatId,
        p_anchor_id: anchorRow.id,
        p_updates: plan.updates.map((update) => ({
          id: update.id,
          start_date: update.startDate,
          end_date: update.endDate,
        })),
        p_delete_ids: plan.deleteIds,
        p_creates: plan.create.map((occurrence) => ({
          start_date: occurrence.startDate,
          end_date: occurrence.endDate,
        })),
        p_ends: options.ends,
      });

    if (rebuildError) {
      // Atomic: the transaction rolled back, so the DB is unchanged. Resync the
      // store to the DB truth in case optimistic edits diverged.
      await reconcileSeriesFromDb(workspaceId, baseTask.repeatId);
      return { error: rebuildError.message };
    }

    // Reconcile the store from the authoritative series the RPC returned: replace
    // this series' rows wholesale (dropping deleted ones, adding created ones).
    const freshRows = (seriesResult ?? []) as TaskRow[];
    const repeatId = baseTask.repeatId;
    set((state) => ({
      tasks: [
        ...state.tasks.filter((task) => task.repeatId !== repeatId),
        ...freshRows.map(mapTaskRow),
      ],
    }));

    return {
      updated: plan.updates.length,
      deleted: plan.deleteIds.length,
      created: plan.create.length,
    };
  },

  moveTask: async (id, startDate, endDate, scope = 'single') => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    if (scope === 'single') {
      const before = get().tasks.find((task) => task.id === id) ?? null;
      await get().updateTask(id, { startDate, endDate }, 'single');
      if (before) recordSingleMoveUndo(workspaceId, before, startDate, endDate);
      return;
    }

    let baseTask = get().tasks.find((task) => task.id === id) ?? null;
    if (!baseTask) {
      const { data: baseTaskData, error: baseTaskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();
      if (baseTaskError || !baseTaskData) {
        console.error(baseTaskError);
        return;
      }
      baseTask = mapTaskRow(baseTaskData as TaskRow);
      set((state) => (
        state.tasks.some((task) => task.id === baseTask!.id)
          ? state
          : { tasks: [...state.tasks, baseTask!] }
      ));
    }

    if (!baseTask.repeatId) {
      const before = baseTask;
      await get().updateTask(id, { startDate, endDate }, 'single');
      recordSingleMoveUndo(workspaceId, before, startDate, endDate);
      return;
    }

    const seriesQuery = supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('repeat_id', baseTask.repeatId);

    const { data: targetRows, error: targetRowsError } = await (scope === 'following'
      ? seriesQuery.gte('start_date', baseTask.startDate)
      : seriesQuery);

    if (targetRowsError) {
      console.error(targetRowsError);
      return;
    }

    const seriesRows = (targetRows ?? []) as TaskRow[];
    if (seriesRows.length === 0) return;

    const shiftedTasks = buildShiftedRepeatTasks(
      { startDate: baseTask.startDate, endDate: baseTask.endDate },
      { startDate, endDate },
      seriesRows.map((row) => ({
        id: row.id,
        startDate: row.start_date,
        endDate: row.end_date,
      })),
    );

    const updatedRows: TaskRow[] = [];

    for (const shiftedTask of shiftedTasks) {
      const { data: updatedRow, error: updateError } = await supabase
        .from('tasks')
        .update({
          start_date: shiftedTask.startDate,
          end_date: shiftedTask.endDate,
        })
        .eq('workspace_id', workspaceId)
        .eq('id', shiftedTask.id)
        .select('*')
        .single();

      if (updateError || !updatedRow) {
        console.error(updateError);

        const refreshQuery = supabase
          .from('tasks')
          .select('*')
          .eq('workspace_id', workspaceId)
          .eq('repeat_id', baseTask.repeatId);

        const { data: refreshedRows, error: refreshError } = await (scope === 'following'
          ? refreshQuery.gte('start_date', baseTask.startDate)
          : refreshQuery);

        if (refreshError) {
          console.error(refreshError);
          return;
        }

        applyUpdatedRows((refreshedRows ?? []) as TaskRow[]);
        return;
      }

      updatedRows.push(updatedRow as TaskRow);
    }

    applyUpdatedRows(updatedRows);

    // Все строки серии обновились — фиксируем обратный ход. При частичном
    // сбое выше мы вышли через reconcile: состояние неоднозначно, и обещать
    // отмену для него нельзя.
    const seriesBeforeById = new Map(seriesRows.map((row) => [row.id, row]));
    const seriesUndoRows = updatedRows.flatMap((row) => {
      const beforeRow = seriesBeforeById.get(row.id);
      if (!beforeRow) return [];
      if (beforeRow.start_date === row.start_date && beforeRow.end_date === row.end_date) {
        return [];
      }
      return [buildDateUndoRow(
        row.id,
        { startDate: beforeRow.start_date, endDate: beforeRow.end_date },
        { startDate: row.start_date, endDate: row.end_date },
      )];
    });
    if (seriesUndoRows.length > 0) {
      get().pushTaskUndo({
        id: makeUndoId(),
        workspaceId,
        kind: 'series-move',
        rows: seriesUndoRows,
      });
    }
  },

  moveTaskDetached: async (id, startDate, endDate) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    const before = get().tasks.find((task) => task.id === id) ?? null;
    if (!before?.repeatId) {
      await get().moveTask(id, startDate, endDate, 'single');
      return;
    }

    const beforeRepeatId = before.repeatId;
    await get().updateTask(id, { startDate, endDate, repeatId: null }, 'single');

    const current = get().tasks.find((task) => task.id === id);
    if (
      !current
      || current.repeatId !== null
      || current.startDate !== startDate
      || current.endDate !== endDate
    ) {
      return;
    }

    get().pushTaskUndo({
      id: makeUndoId(),
      workspaceId,
      kind: 'detach-move',
      rows: [buildDetachUndoRow(
        id,
        { startDate: before.startDate, endDate: before.endDate, repeatId: beforeRepeatId },
        { startDate, endDate },
      )],
    });
  },

  updateTaskWithUndo: async (id, updates) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) {
      return;
    }

    const before = get().tasks.find((task) => task.id === id) ?? null;
    await get().updateTask(id, updates, 'single');
    if (!before) return;

    const current = get().tasks.find((task) => task.id === id);
    if (!current) return;

    // Отменяемыми делаем только одиночные правки из контекстного меню; поле
    // попадает в запись, лишь когда апдейт реально лёг (стор показывает
    // запрошенное значение) и значение действительно менялось.
    const trackedFields: Array<{ key: 'statusId' | 'priority' | 'projectId'; column: string }> = [
      { key: 'statusId', column: 'status_id' },
      { key: 'priority', column: 'priority' },
      { key: 'projectId', column: 'project_id' },
    ];

    const columns: Record<string, { before: TaskUndoFieldValue; after: TaskUndoFieldValue }> = {};
    for (const { key, column } of trackedFields) {
      if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
      const requested = (updates[key] ?? null) as TaskUndoFieldValue;
      const beforeValue = (before[key] ?? null) as TaskUndoFieldValue;
      const currentValue = (current[key] ?? null) as TaskUndoFieldValue;
      if (currentValue !== requested) return;
      if (beforeValue === requested) continue;
      columns[column] = { before: beforeValue, after: requested };
    }

    if (Object.keys(columns).length === 0) return;

    get().pushTaskUndo({
      id: makeUndoId(),
      workspaceId,
      kind: 'quick-edit',
      rows: [buildFieldUndoRow(id, columns)],
    });
  },

  reassignTask: async (id, assigneeId, projectId) => {
    if (assigneeId) {
      const targetAssignee = get().assignees.find((assignee) => assignee.id === assigneeId);
      if (!targetAssignee?.isActive) return;
    }

    await get().updateTask(id, {
      assigneeIds: assigneeId ? [assigneeId] : [],
      ...(projectId !== undefined ? { projectId } : {}),
    });
  },

  deleteTaskSeries: async (repeatId, fromDate) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    const previousTasks = get().tasks;
    const previousSelectedTaskId = get().selectedTaskId;
    const previousHighlightedTaskId = get().highlightedTaskId;
    const previousHighlightedTaskRowAssigneeId = get().highlightedTaskRowAssigneeId;
    const localSeriesIds = previousTasks
      .filter((item) => item.repeatId === repeatId && item.startDate >= fromDate)
      .map((item) => item.id);

    if (localSeriesIds.length > 0) {
      get().removeTasksByIds(localSeriesIds);
    }

    const { data: seriesRows, error: seriesLookupError } = await supabase
      .from('tasks')
      .select('id, description')
      .eq('workspace_id', workspaceId)
      .eq('repeat_id', repeatId)
      .gte('start_date', fromDate);

    const mediaIds = seriesLookupError
      ? []
      : Array.from(new Set(
        ((seriesRows ?? []) as Array<{ description: string | null }>)
          .flatMap((row) => extractTaskMediaIds(row.description)),
      ));

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('repeat_id', repeatId)
      .gte('start_date', fromDate);

    if (error) {
      console.error(error);
      set({
        tasks: previousTasks,
        selectedTaskId: previousSelectedTaskId,
        highlightedTaskId: previousHighlightedTaskId,
        highlightedTaskRowAssigneeId: previousHighlightedTaskRowAssigneeId,
      });
      return;
    }

    scheduleTaskMediaCleanup(mediaIds);
  },

  removeAssigneeFromTask: async (id, assigneeId, mode) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId || !assigneeId) return;

    let baseTask = get().tasks.find((task) => task.id === id) ?? null;
    if (!baseTask) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .single();
      if (error || !data) {
        console.error(error);
        return;
      }
      baseTask = mapTaskRow(data as TaskRow);
    }

    const isFollowingMode = mode === 'following' && Boolean(baseTask.repeatId);
    const fetchTargetRows = () => {
      const query = supabase
        .from('tasks')
        .select('*')
        .eq('workspace_id', workspaceId);
      return isFollowingMode
        ? query.eq('repeat_id', baseTask.repeatId).gte('start_date', baseTask.startDate)
        : query.eq('id', id);
    };

    const { data: targetRows, error: targetRowsError } = await fetchTargetRows();

    if (targetRowsError) {
      console.error(targetRowsError);
      return;
    }

    const rows = (targetRows ?? []) as TaskRow[];
    if (rows.length === 0) return;

    const updatedRows: TaskRow[] = [];
    const deleteIds: string[] = [];

    for (const row of rows) {
      const currentAssignees = normalizeAssigneeIds(row.assignee_ids, row.assignee_id);
      if (!currentAssignees.includes(assigneeId)) continue;

      const nextAssignees = uniqueAssigneeIds(currentAssignees.filter((item) => item !== assigneeId));
      if (nextAssignees.length === 0) {
        deleteIds.push(row.id);
        continue;
      }

      const { data: updatedRow, error: updateError } = await supabase
        .from('tasks')
        .update({
          assignee_ids: nextAssignees,
          assignee_id: nextAssignees[0] ?? null,
        })
        .eq('workspace_id', workspaceId)
        .eq('id', row.id)
        .select('*')
        .single();

      if (updateError || !updatedRow) {
        console.error(updateError);
        // Earlier rows may already be updated in the DB; resync from the DB so
        // the store doesn't silently diverge from the persisted state.
        const { data: refreshed } = await fetchTargetRows();
        applyUpdatedRows((refreshed ?? []) as TaskRow[]);
        return;
      }

      updatedRows.push(updatedRow as TaskRow);
    }

    if (deleteIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('workspace_id', workspaceId)
        .in('id', deleteIds);

      if (deleteError) {
        console.error(deleteError);
        // The assignee updates above are persisted but not yet reflected in the
        // store (the optimistic set() runs only on full success); resync now.
        const { data: refreshed } = await fetchTargetRows();
        applyUpdatedRows((refreshed ?? []) as TaskRow[]);
        return;
      }
    }

    if (updatedRows.length === 0 && deleteIds.length === 0) return;

    set((state) => {
      const updatedById = new Map(updatedRows.map((row) => [row.id, mapTaskRow(row)]));
      const deleted = new Set(deleteIds);
      return {
        tasks: state.tasks
          .filter((task) => !deleted.has(task.id))
          .map((task) => updatedById.get(task.id) ?? task),
        selectedTaskId: state.selectedTaskId && deleted.has(state.selectedTaskId)
          ? null
          : state.selectedTaskId,
      };
    });
  },

  fetchTaskSubtasks: async (workspaceId, taskId) => {
    const { data, error } = await supabase
      .from('task_subtasks')
      .select('id, task_id, title, is_done, done_at, position, created_at')
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

  createTaskSubtask: async (workspaceId, taskId, title, position) => {
    const { data, error } = await supabase
      .from('task_subtasks')
      .insert({
        workspace_id: workspaceId,
        task_id: taskId,
        title,
        is_done: false,
        done_at: null,
        position,
      })
      .select('id, task_id, title, is_done, done_at, position, created_at')
      .single();

    if (error || !data) {
      return { error: error?.message ?? 'Failed to create subtask.' };
    }

    return { subtask: mapTaskSubtaskRow(data as TaskSubtaskRow) };
  },

  createTaskSubtasks: async (workspaceId, taskId, titles) => {
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
