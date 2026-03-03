import { useEffect, useRef } from 'react';
import { supabase } from '@/shared/lib/supabaseClient';
import { Milestone, TaskPriority, ViewMode } from '@/features/planner/types/planner';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { mapTaskRow, type TaskMappedRow } from '@/shared/domain/taskRowMapper';

type LoadedRange = {
  start: string;
  end: string;
  viewMode: ViewMode;
  workspaceId: string;
};

type TaskSyncRow = TaskMappedRow & {
  workspace_id: string;
  priority: TaskPriority | null;
  updated_at: string;
};

type MilestoneSyncRow = {
  id: string;
  workspace_id: string;
  title: string;
  project_id: string;
  date: string;
  updated_at: string;
};

const TASK_SELECT = [
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
  'description',
  'repeat_id',
  'updated_at',
].join(',');

const MILESTONE_SELECT = [
  'id',
  'workspace_id',
  'title',
  'project_id',
  'date',
  'updated_at',
].join(',');

const EVENT_FLUSH_MS = 320;
const EVENT_BATCH_SIZE = 120;
const INTERACTION_RETRY_MS = 220;
const FALLBACK_POLL_BASE_MS = 45_000;
const FALLBACK_POLL_MAX_MS = 180_000;
const FALLBACK_FAILURE_MAX = 6;
const POLL_JITTER_RATIO = 0.18;

const mapMilestoneRow = (row: MilestoneSyncRow): Milestone => ({
  id: row.id,
  title: row.title,
  projectId: row.project_id,
  date: row.date,
});

const inTaskRange = (row: TaskSyncRow, range: LoadedRange) => (
  row.end_date >= range.start && row.start_date <= range.end
);

const inMilestoneRange = (row: MilestoneSyncRow, range: LoadedRange) => (
  row.date >= range.start && row.date <= range.end
);

const takeFromSet = (source: Set<string>, limit: number) => {
  const values: string[] = [];
  for (const value of source) {
    values.push(value);
    source.delete(value);
    if (values.length >= limit) break;
  }
  return values;
};

export const usePlannerLiveSync = (
  workspaceId: string | null,
  loadedRange: LoadedRange | null,
) => {
  const upsertTasks = usePlannerStore((state) => state.upsertTasks);
  const removeTasksByIds = usePlannerStore((state) => state.removeTasksByIds);
  const upsertMilestones = usePlannerStore((state) => state.upsertMilestones);
  const removeMilestonesByIds = usePlannerStore((state) => state.removeMilestonesByIds);

  const lastTaskSyncAtRef = useRef<string | null>(null);
  const lastMilestoneSyncAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !loadedRange || loadedRange.workspaceId !== workspaceId) {
      lastTaskSyncAtRef.current = null;
      lastMilestoneSyncAtRef.current = null;
      return;
    }

    let active = true;
    let lifecycleEpoch = 0;
    const pendingTaskUpserts = new Set<string>();
    const pendingMilestoneUpserts = new Set<string>();
    let flushTimer: number | null = null;
    let fallbackTimer: number | null = null;
    let syncInFlight = false;
    let flushRequested = false;
    let reconcileRequested = false;
    let fallbackFailureCount = 0;
    let channelHealthy = true;
    const rangeRef: LoadedRange = loadedRange;
    const workspaceRef = workspaceId;

    if (!lastTaskSyncAtRef.current) {
      lastTaskSyncAtRef.current = new Date().toISOString();
    }
    if (!lastMilestoneSyncAtRef.current) {
      lastMilestoneSyncAtRef.current = new Date().toISOString();
    }

    const isLifecycleActive = (epoch: number) => active && epoch === lifecycleEpoch;

    const clearFlushTimer = () => {
      if (flushTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(flushTimer);
      }
      flushTimer = null;
    };

    const clearFallbackTimer = () => {
      if (fallbackTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(fallbackTimer);
      }
      fallbackTimer = null;
    };

    const canRunReconcileNow = () => (
      typeof document === 'undefined' || !document.hidden
    );

    const resetFallbackFailures = () => {
      fallbackFailureCount = 0;
    };

    const growFallbackFailures = () => {
      fallbackFailureCount = Math.min(fallbackFailureCount + 1, FALLBACK_FAILURE_MAX);
    };

    const runSyncRunner = async () => {
      if (!active || syncInFlight) return;
      syncInFlight = true;
      try {
        while (active) {
          const shouldRunFlush = flushRequested;
          const shouldRunReconcile = reconcileRequested && canRunReconcileNow();
          if (!shouldRunFlush && !shouldRunReconcile) {
            break;
          }

          if (shouldRunFlush) {
            flushRequested = false;
            const interactionUntil = usePlannerStore.getState().timelineInteractingUntil;
            const shouldDeferUpserts = (
              Date.now() < interactionUntil
              && (pendingTaskUpserts.size > 0 || pendingMilestoneUpserts.size > 0)
            );

            if (shouldDeferUpserts) {
              if (active && typeof window !== 'undefined') {
                clearFlushTimer();
                flushTimer = window.setTimeout(() => {
                  flushTimer = null;
                  flushRequested = true;
                  void runSyncRunner();
                }, INTERACTION_RETRY_MS);
              }
            } else {
              const taskUpsertIds = takeFromSet(pendingTaskUpserts, EVENT_BATCH_SIZE);
              if (taskUpsertIds.length > 0) {
                const taskQueryEpoch = lifecycleEpoch;
                const { data, error } = await supabase
                  .from('tasks')
                  .select(TASK_SELECT)
                  .eq('workspace_id', workspaceRef)
                  .in('id', taskUpsertIds);

                if (!isLifecycleActive(taskQueryEpoch)) {
                  break;
                }

                if (error) {
                  console.error(error);
                  taskUpsertIds.forEach((id) => pendingTaskUpserts.add(id));
                  reconcileRequested = true;
                } else {
                  const rows = (data ?? []) as TaskSyncRow[];
                  const byId = new Map(rows.map((row) => [row.id, row]));
                  const upsertRows = rows.filter((row) => inTaskRange(row, rangeRef));
                  if (upsertRows.length > 0) {
                    upsertTasks(upsertRows.map(mapTaskRow));
                  }
                  const removeIds = taskUpsertIds.filter((id) => {
                    const row = byId.get(id);
                    if (!row) return true;
                    return !inTaskRange(row, rangeRef);
                  });
                  if (removeIds.length > 0) {
                    removeTasksByIds(removeIds);
                  }
                }
              }

              const milestoneUpsertIds = takeFromSet(pendingMilestoneUpserts, EVENT_BATCH_SIZE);
              if (milestoneUpsertIds.length > 0) {
                const milestoneQueryEpoch = lifecycleEpoch;
                const { data, error } = await supabase
                  .from('milestones')
                  .select(MILESTONE_SELECT)
                  .eq('workspace_id', workspaceRef)
                  .in('id', milestoneUpsertIds);

                if (!isLifecycleActive(milestoneQueryEpoch)) {
                  break;
                }

                if (error) {
                  console.error(error);
                  milestoneUpsertIds.forEach((id) => pendingMilestoneUpserts.add(id));
                  reconcileRequested = true;
                } else {
                  const rows = (data ?? []) as MilestoneSyncRow[];
                  const byId = new Map(rows.map((row) => [row.id, row]));
                  const upsertRows = rows.filter((row) => inMilestoneRange(row, rangeRef));
                  if (upsertRows.length > 0) {
                    upsertMilestones(upsertRows.map(mapMilestoneRow));
                  }
                  const removeIds = milestoneUpsertIds.filter((id) => {
                    const row = byId.get(id);
                    if (!row) return true;
                    return !inMilestoneRange(row, rangeRef);
                  });
                  if (removeIds.length > 0) {
                    removeMilestonesByIds(removeIds);
                  }
                }
              }

              if (
                active
                && typeof window !== 'undefined'
                && (pendingTaskUpserts.size > 0 || pendingMilestoneUpserts.size > 0)
              ) {
                clearFlushTimer();
                flushTimer = window.setTimeout(() => {
                  flushTimer = null;
                  flushRequested = true;
                  void runSyncRunner();
                }, 80);
              }
            }
          }

          if (reconcileRequested) {
            if (!canRunReconcileNow()) {
              break;
            }
            reconcileRequested = false;

            const reconcileEpoch = lifecycleEpoch;
            const nowIso = new Date().toISOString();
            const taskSince = lastTaskSyncAtRef.current ?? nowIso;
            const milestoneSince = lastMilestoneSyncAtRef.current ?? nowIso;

            const [
              taskDeltaRes,
              milestoneDeltaRes,
              taskIdsRes,
              milestoneIdsRes,
            ] = await Promise.all([
              supabase
                .from('tasks')
                .select(TASK_SELECT)
                .eq('workspace_id', workspaceRef)
                .gt('updated_at', taskSince)
                .gte('end_date', rangeRef.start)
                .lte('start_date', rangeRef.end)
                .order('updated_at', { ascending: true })
                .limit(1000),
              supabase
                .from('milestones')
                .select(MILESTONE_SELECT)
                .eq('workspace_id', workspaceRef)
                .gt('updated_at', milestoneSince)
                .gte('date', rangeRef.start)
                .lte('date', rangeRef.end)
                .order('updated_at', { ascending: true })
                .limit(1000),
              supabase
                .from('tasks')
                .select('id')
                .eq('workspace_id', workspaceRef)
                .gte('end_date', rangeRef.start)
                .lte('start_date', rangeRef.end),
              supabase
                .from('milestones')
                .select('id')
                .eq('workspace_id', workspaceRef)
                .gte('date', rangeRef.start)
                .lte('date', rangeRef.end),
            ]);

            if (!isLifecycleActive(reconcileEpoch)) {
              break;
            }

            if (taskDeltaRes.error || milestoneDeltaRes.error || taskIdsRes.error || milestoneIdsRes.error) {
              console.error(taskDeltaRes.error ?? milestoneDeltaRes.error ?? taskIdsRes.error ?? milestoneIdsRes.error);
              growFallbackFailures();
              if (
                !channelHealthy
                && active
                && typeof window !== 'undefined'
                && canRunReconcileNow()
              ) {
                clearFallbackTimer();
                const baseDelay = Math.min(
                  FALLBACK_POLL_BASE_MS * (2 ** fallbackFailureCount),
                  FALLBACK_POLL_MAX_MS,
                );
                const jitterWindow = Math.round(baseDelay * POLL_JITTER_RATIO);
                const jitter = Math.round((Math.random() * 2 - 1) * jitterWindow);
                const delayMs = Math.max(20_000, baseDelay + jitter);
                fallbackTimer = window.setTimeout(() => {
                  fallbackTimer = null;
                  reconcileRequested = true;
                  void runSyncRunner();
                }, delayMs);
              }
              continue;
            }

            const taskRows = (taskDeltaRes.data ?? []) as TaskSyncRow[];
            const milestoneRows = (milestoneDeltaRes.data ?? []) as MilestoneSyncRow[];

            if (taskRows.length > 0) {
              upsertTasks(taskRows.map(mapTaskRow));
            }
            if (milestoneRows.length > 0) {
              upsertMilestones(milestoneRows.map(mapMilestoneRow));
            }

            const remoteTaskIds = new Set(((taskIdsRes.data ?? []) as Array<{ id: string }>).map((row) => row.id));
            const staleTaskIds = usePlannerStore.getState().tasks
              .filter((task) => (
                task.endDate >= rangeRef.start
                && task.startDate <= rangeRef.end
                && !remoteTaskIds.has(task.id)
              ))
              .map((task) => task.id);
            if (staleTaskIds.length > 0) {
              removeTasksByIds(staleTaskIds);
            }

            const remoteMilestoneIds = new Set(((milestoneIdsRes.data ?? []) as Array<{ id: string }>).map((row) => row.id));
            const staleMilestoneIds = usePlannerStore.getState().milestones
              .filter((milestone) => (
                milestone.date >= rangeRef.start
                && milestone.date <= rangeRef.end
                && !remoteMilestoneIds.has(milestone.id)
              ))
              .map((milestone) => milestone.id);
            if (staleMilestoneIds.length > 0) {
              removeMilestonesByIds(staleMilestoneIds);
            }

            lastTaskSyncAtRef.current = nowIso;
            lastMilestoneSyncAtRef.current = nowIso;
            resetFallbackFailures();
          }
        }
      } finally {
        syncInFlight = false;
        if (active && (flushRequested || (reconcileRequested && canRunReconcileNow()))) {
          void runSyncRunner();
        }
      }
    };

    const scheduleFlush = (delayMs = EVENT_FLUSH_MS) => {
      if (!active || typeof window === 'undefined') return;
      clearFlushTimer();
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        flushRequested = true;
        void runSyncRunner();
      }, delayMs);
    };

    const requestReconcile = (_reason: 'focus' | 'fallback' | 'resubscribe' | 'channel') => {
      if (!active) return;
      reconcileRequested = true;
      void runSyncRunner();
    };

    const scheduleFallbackPoll = () => {
      if (!active || typeof window === 'undefined') return;
      if (channelHealthy) return;
      if (!canRunReconcileNow()) return;
      clearFallbackTimer();
      const baseDelay = Math.min(
        FALLBACK_POLL_BASE_MS * (2 ** fallbackFailureCount),
        FALLBACK_POLL_MAX_MS,
      );
      const jitterWindow = Math.round(baseDelay * POLL_JITTER_RATIO);
      const jitter = Math.round((Math.random() * 2 - 1) * jitterWindow);
      const delayMs = Math.max(20_000, baseDelay + jitter);
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        requestReconcile('fallback');
      }, delayMs);
    };

    const queueTaskUpsert = (id: string) => {
      pendingTaskUpserts.add(id);
      scheduleFlush();
    };

    const queueTaskDelete = (id: string) => {
      pendingTaskUpserts.delete(id);
      removeTasksByIds([id]);
    };

    const queueMilestoneUpsert = (id: string) => {
      pendingMilestoneUpserts.add(id);
      scheduleFlush();
    };

    const queueMilestoneDelete = (id: string) => {
      pendingMilestoneUpserts.delete(id);
      removeMilestonesByIds([id]);
    };

    const channel = supabase
      .channel(`planner-live-${workspaceRef}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `workspace_id=eq.${workspaceRef}`,
        },
        (payload) => {
          if (!active) return;
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: unknown } | null)?.id;
            if (typeof deletedId === 'string') {
              queueTaskDelete(deletedId);
            }
            return;
          }
          const changedId = (payload.new as { id?: unknown } | null)?.id;
          if (typeof changedId === 'string') {
            queueTaskUpsert(changedId);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'milestones',
          filter: `workspace_id=eq.${workspaceRef}`,
        },
        (payload) => {
          if (!active) return;
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: unknown } | null)?.id;
            if (typeof deletedId === 'string') {
              queueMilestoneDelete(deletedId);
            }
            return;
          }
          const changedId = (payload.new as { id?: unknown } | null)?.id;
          if (typeof changedId === 'string') {
            queueMilestoneUpsert(changedId);
          }
        },
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          channelHealthy = true;
          resetFallbackFailures();
          clearFallbackTimer();
          requestReconcile('resubscribe');
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          channelHealthy = false;
          growFallbackFailures();
          requestReconcile('channel');
          scheduleFallbackPoll();
        }
      });

    const handleVisibilityOrFocus = () => {
      if (!canRunReconcileNow()) return;
      requestReconcile('focus');
      if (!channelHealthy) {
        scheduleFallbackPoll();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleVisibilityOrFocus);
      window.addEventListener('pageshow', handleVisibilityOrFocus);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
      }
    }

    return () => {
      active = false;
      lifecycleEpoch += 1;
      clearFlushTimer();
      clearFallbackTimer();
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleVisibilityOrFocus);
        window.removeEventListener('pageshow', handleVisibilityOrFocus);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
        }
      }
      void supabase.removeChannel(channel);
    };
  }, [
    loadedRange,
    removeMilestonesByIds,
    removeTasksByIds,
    upsertMilestones,
    upsertTasks,
    workspaceId,
  ]);
};
