import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInDays,
  format,
  parseISO,
} from 'date-fns';
import { supabase } from '@/shared/lib/supabaseClient';
import { mapTaskRow, normalizeAssigneeIds } from '@/shared/domain/taskRowMapper';
import { buildShiftedRepeatTasks } from '@/shared/domain/repeatTaskMove';
import { buildRepeatSeriesRebuildPlan } from '@/shared/domain/repeatSeriesRebuild';
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
  | 'deleteTask'
  | 'deleteTasks'
  | 'duplicateTask'
  | 'createRepeats'
  | 'updateRepeatSeries'
  | 'moveTask'
  | 'reassignTask'
  | 'deleteTaskSeries'
  | 'removeAssigneeFromTask'
  | 'fetchTaskSubtasks'
  | 'createTaskSubtask'
  | 'createTaskSubtasks'
  | 'updateTaskSubtaskCompletion'
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

  const insertRepeatSeriesTasks = async (params: {
    workspaceId: string;
    repeatId: string;
    sourceRow: TaskRow;
    startEndDates: Array<{ startDate: string; endDate: string }>;
  }) => {
    if (params.startEndDates.length === 0) {
      return { rows: [] as TaskRow[], error: undefined as string | undefined };
    }

    const assigneeIds = uniqueAssigneeIds(
      normalizeAssigneeIds(params.sourceRow.assignee_ids, params.sourceRow.assignee_id),
    );

    const { data, error } = await supabase
      .from('tasks')
      .insert(params.startEndDates.map(({ startDate, endDate }) => ({
        workspace_id: params.workspaceId,
        title: params.sourceRow.title,
        project_id: params.sourceRow.project_id,
        assignee_id: assigneeIds[0] ?? null,
        assignee_ids: assigneeIds,
        start_date: startDate,
        end_date: endDate,
        status_id: params.sourceRow.status_id,
        type_id: params.sourceRow.type_id,
        priority: params.sourceRow.priority,
        tag_ids: params.sourceRow.tag_ids ?? [],
        description: params.sourceRow.description ?? null,
        repeat_id: params.repeatId,
      })))
      .select('*');

    if (error) {
      return { rows: [] as TaskRow[], error: error.message };
    }

    return { rows: ((data ?? []) as TaskRow[]), error: undefined as string | undefined };
  };

  return ({
  addTask: async (task) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return null;

    const assigneeIds = pickActiveAssigneeIds(task.assigneeIds, get().assignees);

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        workspace_id: workspaceId,
        title: task.title,
        project_id: task.projectId,
        assignee_id: assigneeIds[0] ?? null,
        assignee_ids: assigneeIds,
        start_date: task.startDate,
        end_date: task.endDate,
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
  },

  deleteTask: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    const previousTasks = get().tasks;
    const previousSelectedTaskId = get().selectedTaskId;
    const previousHighlightedTaskId = get().highlightedTaskId;
    const previousHighlightedTaskRowAssigneeId = get().highlightedTaskRowAssigneeId;

    // Optimistic remove: при ошибке восстанавливаем state, чтобы не потерять выбранную задачу.
    get().removeTasksByIds([id]);

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
    }
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
        .update({ repeat_id: repeatId })
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

    const updatedRows: TaskRow[] = [];

    for (const update of plan.updates) {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          start_date: update.startDate,
          end_date: update.endDate,
        })
        .eq('workspace_id', workspaceId)
        .eq('id', update.id)
        .select('*')
        .single();

      if (error || !data) {
        return { error: error?.message ?? 'Failed to update repeat task.' };
      }

      updatedRows.push(data as TaskRow);
    }

    if (plan.deleteIds.length > 0) {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('workspace_id', workspaceId)
        .in('id', plan.deleteIds);

      if (error) {
        return { error: error.message };
      }

      get().removeTasksByIds(plan.deleteIds);
    }

    const inserted = await insertRepeatSeriesTasks({
      workspaceId,
      repeatId: baseTask.repeatId,
      sourceRow: anchorRow,
      startEndDates: plan.create,
    });
    if (inserted.error) {
      return { error: inserted.error };
    }

    applyUpdatedRows(updatedRows);
    if (inserted.rows.length > 0) {
      set((state) => ({
        tasks: [...state.tasks, ...inserted.rows.map(mapTaskRow)],
      }));
    }

    return {
      updated: plan.updates.length,
      deleted: plan.deleteIds.length,
      created: inserted.rows.length,
    };
  },

  moveTask: async (id, startDate, endDate, scope = 'single') => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;

    if (scope === 'single') {
      await get().updateTask(id, { startDate, endDate }, 'single');
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
      await get().updateTask(id, { startDate, endDate }, 'single');
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
    }
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
    const query = supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId);

    const { data: targetRows, error: targetRowsError } = await (isFollowingMode
      ? query
        .eq('repeat_id', baseTask.repeatId)
        .gte('start_date', baseTask.startDate)
      : query.eq('id', id));

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
