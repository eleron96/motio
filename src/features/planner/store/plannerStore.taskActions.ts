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
  | 'moveTask'
  | 'reassignTask'
  | 'deleteTaskSeries'
  | 'removeAssigneeFromTask'
  | 'fetchTaskSubtasks'
  | 'createTaskSubtask'
  | 'createTaskSubtasks'
  | 'updateTaskSubtaskCompletion'
  | 'deleteTaskSubtask'
>;

export const createTaskActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): TaskActions => ({
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

    const applyUpdatedRows = (rows: TaskRow[]) => {
      if (rows.length === 0) return;
      const updatedById = new Map(rows.map((row) => [row.id, mapTaskRow(row)]));
      set((state) => ({
        tasks: state.tasks.map((task) => updatedById.get(task.id) ?? task),
      }));
    };

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
      });
      return { error: error.message };
    }

    return {};
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
      description: task.description,
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
        description: task.description,
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

  moveTask: async (id, startDate, endDate) => {
    await get().updateTask(id, { startDate, endDate });
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
