import { supabase } from '@/shared/lib/supabaseClient';
import { mapTaskRow } from '@/shared/domain/taskRowMapper';
import { extractTaskMediaIds } from '@/shared/domain/taskMediaIds';
import {
  collectSubtaskMediaIds,
  deleteTaskMediaBatch,
  filterOrphanTaskMediaIds,
} from '@/infrastructure/tasks/taskMediaRepository';
import { buildDateUndoRow, classifyDateChange } from '@/shared/domain/taskUndo';
import type { Task } from '@/features/planner/types/planner';
import type {
  PlannerGetState,
  PlannerSetState,
} from '@/features/planner/store/plannerStore.contract';
import { TaskRow } from '@/features/planner/store/plannerStore.helpers';

/**
 * Helpers shared by the planner store's task slices. They only read and write
 * the store through `set`/`get` and hold no state of their own, so every slice
 * can build its own copy.
 */
export const createTaskActionHelpers = (
  set: PlannerSetState,
  get: PlannerGetState,
) => {
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

  /**
   * Fire-and-forget deletion of task-media blobs whose IDs are no longer
   * referenced by any task in the current state. Called after DB mutations
   * succeed. Never blocks the caller — media cleanup is best-effort GC.
   */
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
   * ID referenced inside them, plus the pictures of their subtasks (which go
   * with the task). Used before task deletion to know which media blobs to
   * GC. Descriptions fall back to the in-memory store if the fetch fails.
   */
  const collectTaskMediaIdsForIds = async (
    workspaceId: string,
    taskIds: string[],
  ): Promise<string[]> => {
    if (taskIds.length === 0) return [];
    const [descriptionIds, subtaskIds] = await Promise.all([
      collectDescriptionMediaIdsForIds(workspaceId, taskIds),
      collectSubtaskMediaIds(workspaceId, taskIds),
    ]);
    return Array.from(new Set([...descriptionIds, ...subtaskIds]));
  };

  const collectDescriptionMediaIdsForIds = async (
    workspaceId: string,
    taskIds: string[],
  ): Promise<string[]> => {

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

  return {
    applyUpdatedRows,
    reconcileSeriesFromDb,
    makeUndoId,
    recordSingleMoveUndo,
    scheduleTaskMediaCleanup,
    collectTaskMediaIdsForIds,
    collectDescriptionMediaIdsForIds,
  };
};
