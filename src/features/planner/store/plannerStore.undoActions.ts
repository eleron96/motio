import { supabase } from '@/shared/lib/supabaseClient';
import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';
import { mapTaskRow } from '@/shared/domain/taskRowMapper';
import { extractTaskMediaIds } from '@/shared/domain/taskMediaIds';
import {
  deleteTaskMediaBatch,
  filterOrphanTaskMediaIds,
} from '@/infrastructure/tasks/taskMediaRepository';
import {
  collectUndoCascade,
  pushUndoEntry,
  TaskUndoEntry,
  TaskUndoOutcome,
  TaskUndoRow,
} from '@/shared/domain/taskUndo';
import type { Task } from '@/features/planner/types/planner';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import type { TaskRow } from '@/features/planner/store/plannerStore.helpers';

type UndoActions = Pick<
  PlannerStore,
  | 'pushTaskUndo'
  | 'undoTaskEntry'
  | 'undoLastTask'
  | 'deleteTaskDeferred'
>;

/**
 * The real DELETE fires this long after the optimistic hide. Slightly longer
 * than the undo toast (6s), so a click at the toast's last moment still wins
 * the race against the commit.
 */
const DELETE_COMMIT_DELAY_MS = 7000;

export const createUndoActions = (
  set: PlannerSetState,
  get: PlannerGetState,
): UndoActions => {
  const makeUndoId = () => (
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  /**
   * Deletes waiting out their undo window: entryId -> hidden tasks + the
   * commit timer. Lives outside the store state — timers are not data. The
   * task IDS, however, are mirrored into state.pendingDeleteTaskIds so that
   * upsertTasks can drop incoming live-sync updates for hidden rows.
   */
  const pendingDeletes = new Map<string, {
    snapshot: Task[];
    timer: ReturnType<typeof setTimeout>;
    workspaceId: string;
  }>();

  const removePendingDeleteTaskIds = (taskIds: string[]) => {
    if (taskIds.length === 0) return;
    const removed = new Set(taskIds);
    set((state) => ({
      pendingDeleteTaskIds: state.pendingDeleteTaskIds.filter((id) => !removed.has(id)),
    }));
  };

  /**
   * Auth token cache for the pagehide flush: the unload path cannot await
   * supabase.auth.getSession(), so the token is snapshotted whenever a
   * deferred delete is scheduled (the user just performed an authorized
   * mutation, so a session is guaranteed to exist at that moment).
   */
  let cachedAccessToken: string | null = null;
  const refreshCachedAccessToken = () => {
    void supabase.auth.getSession()
      .then(({ data }) => {
        cachedAccessToken = data.session?.access_token ?? cachedAccessToken;
      })
      .catch(() => {});
  };

  /**
   * The tab is going away mid-window: fire the pending DELETEs immediately
   * with keepalive fetch (supabase-js won't finish in time; sendBeacon can't
   * carry auth headers). If anything needed is missing, we simply skip — the
   * failure mode is "task survives", never data loss. Media GC is skipped on
   * this path: a leaked blob is safer than a lost delete.
   */
  const flushPendingDeletes = () => {
    if (pendingDeletes.size === 0) return;
    if (isDemoRoute()) return;
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey || !cachedAccessToken) return;

    for (const pending of pendingDeletes.values()) {
      clearTimeout(pending.timer);
      const ids = pending.snapshot.map((task) => task.id).join(',');
      void fetch(
        `${url}/rest/v1/tasks?workspace_id=eq.${pending.workspaceId}&id=in.(${ids})`,
        {
          method: 'DELETE',
          keepalive: true,
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${cachedAccessToken}`,
          },
        },
      ).catch(() => {});
    }
    pendingDeletes.clear();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushPendingDeletes);
  }

  /**
   * The point of no return: drops the undo entry, then performs the real
   * DELETE (with the same media GC the immediate path does). On failure the
   * task is resurrected in the store — the safe direction is "delete didn't
   * happen", never silent data loss.
   */
  const commitDeferredDelete = async (entryId: string) => {
    const pending = pendingDeletes.get(entryId);
    if (!pending) return;
    pendingDeletes.delete(entryId);
    set((state) => ({
      taskUndoStack: state.taskUndoStack.filter((entry) => entry.id !== entryId),
    }));

    const taskIds = pending.snapshot.map((task) => task.id);

    let mediaIds: string[] = [];
    const { data: mediaRows, error: mediaError } = await supabase
      .from('tasks')
      .select('id, description')
      .eq('workspace_id', pending.workspaceId)
      .in('id', taskIds);
    if (mediaError) {
      console.error(mediaError);
    } else {
      mediaIds = ((mediaRows ?? []) as Array<{ description: string | null }>)
        .flatMap((row) => (
          typeof row.description === 'string' ? extractTaskMediaIds(row.description) : []
        ));
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('workspace_id', pending.workspaceId)
      .in('id', taskIds);

    // Строка либо удалена, либо удаление не прошло — в обоих случаях id
    // больше не должен блокировать входящие апдейты.
    removePendingDeleteTaskIds(taskIds);

    if (error) {
      console.error(error);
      if (get().workspaceId === pending.workspaceId) {
        get().upsertTasks(pending.snapshot);
      }
      return;
    }

    // Сироты подтверждаются по БД, а не по локальному стору: дубликат задачи
    // вне загруженного диапазона может ссылаться на тот же блоб.
    if (mediaIds.length > 0) {
      const orphanIds = await filterOrphanTaskMediaIds(pending.workspaceId, mediaIds);
      if (orphanIds.length > 0) {
        void deleteTaskMediaBatch(orphanIds);
      }
    }
  };

  const applyRows = (rows: TaskRow[]) => {
    if (rows.length === 0) return;
    const updatedById = new Map(rows.map((row) => [row.id, mapTaskRow(row)]));
    set((state) => ({
      tasks: state.tasks.map((task) => updatedById.get(task.id) ?? task),
    }));
  };

  /**
   * Conditional inverse update: writes `restore` only while every `expect`
   * column still holds the value our original action set. Zero matched rows
   * means a teammate changed (or deleted) the task after us — their newer
   * intent wins and the row is reported stale instead of overwritten.
   */
  const applyUndoRow = async (
    workspaceId: string,
    row: TaskUndoRow,
  ): Promise<'restored' | 'stale' | 'failed'> => {
    let query = supabase
      .from('tasks')
      .update(row.restore)
      .eq('id', row.taskId)
      .eq('workspace_id', workspaceId);

    for (const [column, value] of Object.entries(row.expect)) {
      query = value === null ? query.is(column, null) : query.eq(column, value);
    }

    const { data, error } = await query.select('*');
    if (error) {
      console.error(error);
      return 'failed';
    }

    const updatedRows = (data ?? []) as TaskRow[];
    if (updatedRows.length === 0) return 'stale';

    applyRows(updatedRows);
    return 'restored';
  };

  /**
   * Undo of a deferred delete. Purely local while the window is open — cancel
   * the timer — but the tasks are restored from a fresh DB read, NOT from the
   * snapshot: a teammate may have edited (their version must win) or deleted
   * (nothing to resurrect) the rows during the window.
   */
  const undoDeferredDelete = async (
    entry: TaskUndoEntry,
    outcome: TaskUndoOutcome,
  ) => {
    outcome.total += entry.rows.length;
    const pending = pendingDeletes.get(entry.id);
    if (!pending) {
      outcome.stale += entry.rows.length;
      return;
    }
    clearTimeout(pending.timer);
    pendingDeletes.delete(entry.id);

    const taskIds = pending.snapshot.map((task) => task.id);
    // Снять блок до рефетча, иначе upsertTasks отбросит восстановление.
    removePendingDeleteTaskIds(taskIds);

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', pending.workspaceId)
      .in('id', taskIds);

    if (error) {
      console.error(error);
      // Сеть подвела, но строки в БД целы: возвращаем снапшот, чтобы
      // пользователь видел задачу; ближайший reconcile выровняет данные.
      if (get().workspaceId === pending.workspaceId) {
        get().upsertTasks(pending.snapshot);
      }
      outcome.restored += entry.rows.length;
      return;
    }

    const liveRows = (data ?? []) as TaskRow[];
    if (liveRows.length === 0) {
      // Задачу успели удалить по-настоящему — воскрешать нечего.
      outcome.stale += entry.rows.length;
      return;
    }
    if (get().workspaceId === pending.workspaceId) {
      get().upsertTasks(liveRows.map(mapTaskRow));
    }
    outcome.restored += liveRows.length;
    outcome.stale += Math.max(0, entry.rows.length - liveRows.length);
  };

  return {
    pushTaskUndo: (entry) => {
      // Запись, финишировавшая после смены воркспейса (длинная серия),
      // не имеет права ни попасть в чужой стек, ни вычистить его.
      if (entry.workspaceId !== get().workspaceId) return;
      set((state) => ({
        taskUndoStack: pushUndoEntry(state.taskUndoStack, entry),
      }));
    },

    undoTaskEntry: async (entryId) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) return null;

      const { toUndo, rest } = collectUndoCascade(get().taskUndoStack, entryId);
      if (toUndo.length === 0) return null;

      // Снимаем записи со стека до сетевых вызовов: повторный клик по тосту
      // или второй Cmd+Z не должны катить ту же отмену дважды.
      set({ taskUndoStack: rest });

      const outcome: TaskUndoOutcome = { restored: 0, stale: 0, failed: 0, total: 0 };
      for (const entry of toUndo) {
        // Отмена отложенного удаления не ходит в сеть по чужим данным и
        // должна работать даже из другого воркспейса (гасит таймер), поэтому
        // разбирается до workspace-гарда.
        if (entry.kind === 'delete') {
          await undoDeferredDelete(entry, outcome);
          continue;
        }

        if (entry.workspaceId !== workspaceId) continue;

        const failedRows: TaskUndoRow[] = [];
        for (const row of entry.rows) {
          outcome.total += 1;
          const result = await applyUndoRow(workspaceId, row);
          outcome[result] += 1;
          if (result === 'failed') failedRows.push(row);
        }

        // Сетевые сбои (не stale!) возвращаются в стек той же записью:
        // «попробуйте ещё раз» в тосте и Cmd+Z целятся в остаток, а не в
        // следующее несвязанное действие. Прежний id уже показан в тостах,
        // поэтому свежий тост на репуш появится и даст кнопку повтора.
        if (failedRows.length > 0) {
          get().pushTaskUndo({ ...entry, rows: failedRows });
        }
      }
      return outcome;
    },

    undoLastTask: async () => {
      const head = get().taskUndoStack[0];
      if (!head) return null;
      return get().undoTaskEntry(head.id);
    },

    deleteTaskDeferred: async (id) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) return;

      const snapshot = get().tasks.filter((task) => task.id === id);
      if (snapshot.length === 0) {
        // Задачи нет в сторе (глубокая ссылка и т.п.) — удаляем немедленно
        // старым путём, окно отмены обещать нечем.
        await get().deleteTask(id);
        return;
      }

      refreshCachedAccessToken();
      get().removeTasksByIds([id]);
      set((state) => ({
        pendingDeleteTaskIds: state.pendingDeleteTaskIds.includes(id)
          ? state.pendingDeleteTaskIds
          : [...state.pendingDeleteTaskIds, id],
      }));

      const entryId = makeUndoId();
      const timer = setTimeout(() => { void commitDeferredDelete(entryId); }, DELETE_COMMIT_DELAY_MS);
      pendingDeletes.set(entryId, { snapshot, timer, workspaceId });
      get().pushTaskUndo({
        id: entryId,
        workspaceId,
        kind: 'delete',
        rows: [{ taskId: id, restore: {}, expect: {} }],
      });
    },
  };
};
