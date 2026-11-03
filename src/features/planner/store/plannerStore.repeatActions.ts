import { createTaskActionHelpers } from '@/features/planner/store/plannerStore.taskActionHelpers';
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
import { mapTaskRow } from '@/shared/domain/taskRowMapper';
import { buildRepeatSeriesRebuildPlan } from '@/shared/domain/repeatSeriesRebuild';
import { extractTaskMediaIds } from '@/shared/domain/taskMediaIds';
import { collectSubtaskMediaIds } from '@/infrastructure/tasks/taskMediaRepository';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import { pickActiveAssigneeIds, TaskRow } from '@/features/planner/store/plannerStore.helpers';

// Repeat series: creating them, editing the whole series, deleting it.
type RepeatActions = Pick<
  PlannerStore,
  | 'createRepeats'
  | 'updateRepeatSeries'
  | 'deleteTaskSeries'
>;

export const createRepeatActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): RepeatActions => {
  const {
    reconcileSeriesFromDb,
    scheduleTaskMediaCleanup,
  } = createTaskActionHelpers(set, get);

  return ({
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

    const seriesTaskRows = (seriesRows ?? []) as Array<{ id: string; description: string | null }>;
    const subtaskMediaIds = seriesLookupError
      ? []
      : await collectSubtaskMediaIds(workspaceId, seriesTaskRows.map((row) => row.id));
    const mediaIds = seriesLookupError
      ? []
      : Array.from(new Set([
        ...seriesTaskRows.flatMap((row) => extractTaskMediaIds(row.description)),
        ...subtaskMediaIds,
      ]));

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('repeat_id', repeatId)
      .gte('start_date', fromDate);

    if (error) {
      set({
        tasks: previousTasks,
        selectedTaskId: previousSelectedTaskId,
        highlightedTaskId: previousHighlightedTaskId,
        highlightedTaskRowAssigneeId: previousHighlightedTaskRowAssigneeId,
      });
      get().reportTaskWriteFailure('delete', 'deleteTaskSeries', error);
      return;
    }

    scheduleTaskMediaCleanup(mediaIds);
  },
  });
};
