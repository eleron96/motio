import { createTaskActionHelpers } from '@/features/planner/store/plannerStore.taskActionHelpers';
import { supabase } from '@/shared/lib/supabaseClient';
import { mapTaskRow, normalizeAssigneeIds } from '@/shared/domain/taskRowMapper';
import { buildShiftedRepeatTasks } from '@/shared/domain/repeatTaskMove';
import {
  buildDateUndoRow,
  buildDetachUndoRow,
  buildFieldUndoRow,
  TaskUndoFieldValue,
} from '@/shared/domain/taskUndo';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import { TaskRow, uniqueAssigneeIds } from '@/features/planner/store/plannerStore.helpers';

// Moving tasks on the timeline and between people, with undo.
type TaskMoveActions = Pick<
  PlannerStore,
  | 'moveTask'
  | 'moveTaskDetached'
  | 'updateTaskWithUndo'
  | 'reassignTask'
  | 'removeAssigneeFromTask'
>;

export const createTaskMoveActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): TaskMoveActions => {
  const {
    applyUpdatedRows,
    makeUndoId,
    recordSingleMoveUndo,
  } = createTaskActionHelpers(set, get);

  return ({
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
        get().reportTaskWriteFailure('save', 'moveTask', baseTaskError);
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

    const anchor = baseTask;
    const repeatId = anchor.repeatId;
    const baseRange = { startDate: anchor.startDate, endDate: anchor.endDate };
    const nextRange = { startDate, endDate };
    const applyShifted = (shifted: Array<{ id: string; startDate: string; endDate: string }>) => {
      const shiftedById = new Map(shifted.map((item) => [item.id, item]));
      set((state) => ({
        tasks: state.tasks.map((task) => {
          const next = shiftedById.get(task.id);
          return next ? { ...task, startDate: next.startDate, endDate: next.endDate } : task;
        }),
      }));
    };

    // The occurrences on screen move at once (each one shifts on its own, so
    // the loaded rows are enough); the whole series follows in one call.
    const loadedBefore = get().tasks.filter((task) => (
      task.repeatId === repeatId && (scope !== 'following' || task.startDate >= anchor.startDate)
    ));
    applyShifted(buildShiftedRepeatTasks(baseRange, nextRange, loadedBefore));
    const restoreLoaded = () => applyShifted(loadedBefore);

    const seriesQuery = supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('repeat_id', repeatId);

    const { data: targetRows, error: targetRowsError } = await (scope === 'following'
      ? seriesQuery.gte('start_date', anchor.startDate)
      : seriesQuery);

    if (targetRowsError) {
      restoreLoaded();
      get().reportTaskWriteFailure('save', 'moveTask', targetRowsError);
      return;
    }

    const seriesRows = (targetRows ?? []) as TaskRow[];
    if (seriesRows.length === 0) {
      restoreLoaded();
      return;
    }

    const shiftedTasks = buildShiftedRepeatTasks(
      baseRange,
      nextRange,
      seriesRows.map((row) => ({
        id: row.id,
        startDate: row.start_date,
        endDate: row.end_date,
      })),
    );

    // One transaction (migration 0164) instead of an UPDATE per occurrence:
    // the series never ends up half-moved.
    const { data: movedRows, error: moveError } = await supabase.rpc('shift_repeat_series', {
      p_workspace_id: workspaceId,
      p_repeat_id: repeatId,
      p_rows: shiftedTasks.map((item) => ({
        id: item.id,
        start_date: item.startDate,
        end_date: item.endDate,
      })),
    });

    if (moveError) {
      get().reportTaskWriteFailure('save', 'moveTask', moveError);
      // Nothing moved in the database: show the series as it is there.
      applyUpdatedRows(seriesRows);
      return;
    }

    const updatedRows = (movedRows ?? []) as TaskRow[];
    applyUpdatedRows(updatedRows);

    // Серия сдвинулась целиком (одна транзакция) — фиксируем обратный ход.
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
        repeatId: repeatId ?? undefined,
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
        get().reportTaskWriteFailure('save', 'removeAssigneeFromTask', error);
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
      get().reportTaskWriteFailure('save', 'removeAssigneeFromTask', targetRowsError);
      return;
    }

    const rows = (targetRows ?? []) as TaskRow[];
    if (rows.length === 0) return;

    const updatedRows: TaskRow[] = [];
    const deleteIds: string[] = [];
    // Occurrences of a series usually share their assignees, so rows left with
    // the same list go out as one UPDATE: one request for the whole series
    // instead of one per occurrence, sent one after another.
    const updateGroups = new Map<string, { assigneeIds: string[]; ids: string[] }>();

    for (const row of rows) {
      const currentAssignees = normalizeAssigneeIds(row.assignee_ids, row.assignee_id);
      if (!currentAssignees.includes(assigneeId)) continue;

      const nextAssignees = uniqueAssigneeIds(currentAssignees.filter((item) => item !== assigneeId));
      if (nextAssignees.length === 0) {
        deleteIds.push(row.id);
        continue;
      }

      const groupKey = nextAssignees.join(',');
      const group = updateGroups.get(groupKey);
      if (group) {
        group.ids.push(row.id);
      } else {
        updateGroups.set(groupKey, { assigneeIds: nextAssignees, ids: [row.id] });
      }
    }

    for (const group of updateGroups.values()) {
      const { data: groupRows, error: updateError } = await supabase
        .from('tasks')
        .update({
          assignee_ids: group.assigneeIds,
          assignee_id: group.assigneeIds[0] ?? null,
        })
        .eq('workspace_id', workspaceId)
        .in('id', group.ids)
        .select('*');

      if (updateError) {
        get().reportTaskWriteFailure('save', 'removeAssigneeFromTask', updateError);
        // Earlier groups may already be updated in the DB; resync from the DB
        // so the store doesn't silently diverge from the persisted state.
        const { data: refreshed } = await fetchTargetRows();
        applyUpdatedRows((refreshed ?? []) as TaskRow[]);
        return;
      }

      updatedRows.push(...((groupRows ?? []) as TaskRow[]));
    }

    if (deleteIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('workspace_id', workspaceId)
        .in('id', deleteIds);

      if (deleteError) {
        get().reportTaskWriteFailure('save', 'removeAssigneeFromTask', deleteError);
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
  });
};
