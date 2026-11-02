import { createElement, useEffect, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { t } from '@lingui/macro';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import {
  mapMilestoneRow,
  mapTimeOffRow,
  type LoadedTaskWindow,
} from '@/features/planner/store/plannerStore.helpers';
import { fetchBoardTaskIds, fetchTaskDeltaSince } from '@/infrastructure/tasks/boardTasksRepository';
import {
  fetchMilestoneRowsByIds,
  fetchPlannerChanges,
  fetchTasksByIds,
  fetchTimeOffRowsInWindow,
} from '@/infrastructure/planner/plannerLiveRepository';
import { openPlannerLiveChannel } from '@/infrastructure/planner/plannerLiveChannel';
import {
  isTaskInBoardScope,
  isTaskInLoadScopes,
  isTaskInWindow,
  type TaskLoadScopes,
} from '@/shared/domain/taskLoadScopes';

type LoadedRange = LoadedTaskWindow;

const EVENT_FLUSH_MS = 320;
const EVENT_BATCH_SIZE = 120;
const INTERACTION_RETRY_MS = 220;
const INITIAL_RECONCILE_DELAY_MS = 15_000;
const FALLBACK_POLL_BASE_MS = 45_000;
const FALLBACK_POLL_MAX_MS = 180_000;
const FALLBACK_FAILURE_MAX = 6;
const POLL_JITTER_RATIO = 0.18;
// One return to the tab fires focus, pageshow and visibilitychange together.
const FOCUS_RECONCILE_COALESCE_MS = 2_000;
// While the channel is healthy realtime already delivers changes, so quick
// switching between tabs doesn't need a full reconcile every time.
const FOCUS_RECONCILE_MIN_INTERVAL_MS = 60_000;

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
  const refreshTaskCommentCounts = usePlannerStore((state) => state.refreshTaskCommentCounts);

  const lastTaskSyncAtRef = useRef<string | null>(null);
  const lastMilestoneSyncAtRef = useRef<string | null>(null);
  const lastTaskCommentSyncAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId || !loadedRange || loadedRange.workspaceId !== workspaceId) {
      lastTaskSyncAtRef.current = null;
      lastMilestoneSyncAtRef.current = null;
      lastTaskCommentSyncAtRef.current = null;
      return;
    }

    let active = true;
    let lifecycleEpoch = 0;
    const pendingTaskUpserts = new Set<string>();
    const pendingMilestoneUpserts = new Set<string>();
    const pendingTaskCommentCountRefreshes = new Set<string>();
    let flushTimer: number | null = null;
    let fallbackTimer: number | null = null;
    let initialReconcileTimer: number | null = null;
    let syncInFlight = false;
    let flushRequested = false;
    let reconcileRequested = false;
    let fallbackFailureCount = 0;
    let channelHealthy = true;
    let hasSubscribedOnce = false;
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let channelEpoch = 0;
    let reconnectInFlight = false;
    let lastReconnectAttemptAt = 0;
    let lastFocusReconcileAt = 0;
    // The window was just loaded, which counts as a fresh reconcile.
    let lastReconcileCompletedAt = Date.now();
    const rangeRef: LoadedRange = loadedRange;
    const workspaceRef = workspaceId;
    // The window is fixed for this subscription's lifetime (a new window
    // re-runs the effect); the board scope is read live, so toggling the board
    // does not tear down the channel.
    const currentScopes = (): TaskLoadScopes => {
      const board = usePlannerStore.getState().boardScope;
      return {
        window: rangeRef,
        board: board && board.workspaceId === workspaceRef ? board : null,
      };
    };

    if (!lastTaskSyncAtRef.current) {
      lastTaskSyncAtRef.current = new Date().toISOString();
    }
    if (!lastMilestoneSyncAtRef.current) {
      lastMilestoneSyncAtRef.current = new Date().toISOString();
    }
    if (!lastTaskCommentSyncAtRef.current) {
      lastTaskCommentSyncAtRef.current = new Date().toISOString();
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

    const clearInitialReconcileTimer = () => {
      if (initialReconcileTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(initialReconcileTimer);
      }
      initialReconcileTimer = null;
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
                const tasksRes = await fetchTasksByIds(workspaceRef, taskUpsertIds);

                if (!isLifecycleActive(taskQueryEpoch)) {
                  break;
                }

                if ('error' in tasksRes) {
                  console.error(tasksRes.error);
                  taskUpsertIds.forEach((id) => pendingTaskUpserts.add(id));
                  reconcileRequested = true;
                } else {
                  const scopes = currentScopes();
                  const scopedById = new Map(
                    tasksRes.data
                      .filter((task) => isTaskInLoadScopes(task, scopes))
                      .map((task) => [task.id, task]),
                  );
                  if (scopedById.size > 0) {
                    upsertTasks(Array.from(scopedById.values()));
                    scopedById.forEach((_task, id) => pendingTaskCommentCountRefreshes.add(id));
                  }
                  // Missing (deleted or no longer visible) or outside every scope.
                  const removeIds = taskUpsertIds.filter((id) => !scopedById.has(id));
                  if (removeIds.length > 0) {
                    removeTasksByIds(removeIds);
                  }
                }
              }

              const milestoneUpsertIds = takeFromSet(pendingMilestoneUpserts, EVENT_BATCH_SIZE);
              if (milestoneUpsertIds.length > 0) {
                const milestoneQueryEpoch = lifecycleEpoch;
                const milestonesRes = await fetchMilestoneRowsByIds(workspaceRef, milestoneUpsertIds);

                if (!isLifecycleActive(milestoneQueryEpoch)) {
                  break;
                }

                if ('error' in milestonesRes) {
                  console.error(milestonesRes.error);
                  milestoneUpsertIds.forEach((id) => pendingMilestoneUpserts.add(id));
                  reconcileRequested = true;
                } else {
                  const rows = milestonesRes.data;
                  const returnedIds = new Set(rows.map((row) => row.id));
                  if (rows.length > 0) {
                    upsertMilestones(rows.map(mapMilestoneRow));
                  }
                  // Milestones are not windowed by date (unlike tasks), so a
                  // row missing from the response means it was deleted.
                  const removeIds = milestoneUpsertIds.filter((id) => !returnedIds.has(id));
                  if (removeIds.length > 0) {
                    removeMilestonesByIds(removeIds);
                  }
                }
              }

              const taskCommentRefreshIds = takeFromSet(
                pendingTaskCommentCountRefreshes,
                EVENT_BATCH_SIZE,
              );
              if (taskCommentRefreshIds.length > 0) {
                const taskCommentRefreshEpoch = lifecycleEpoch;
                const refreshResult = await refreshTaskCommentCounts(workspaceRef, taskCommentRefreshIds);
                if (!isLifecycleActive(taskCommentRefreshEpoch)) {
                  break;
                }
                if (refreshResult.error) {
                  taskCommentRefreshIds.forEach((taskId) => pendingTaskCommentCountRefreshes.add(taskId));
                  reconcileRequested = true;
                }
              }

              if (
                active
                && typeof window !== 'undefined'
                && (
                  pendingTaskUpserts.size > 0
                  || pendingMilestoneUpserts.size > 0
                  || pendingTaskCommentCountRefreshes.size > 0
                )
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
            const reconcileScopes = currentScopes();
            const reconcileBoard = reconcileScopes.board;
            const nowIso = new Date().toISOString();
            const taskSince = lastTaskSyncAtRef.current ?? nowIso;
            const milestoneSince = lastMilestoneSyncAtRef.current ?? nowIso;
            const taskCommentSince = lastTaskCommentSyncAtRef.current ?? nowIso;

            const changesRes = await fetchPlannerChanges(workspaceRef, rangeRef, {
              tasks: taskSince,
              milestones: milestoneSince,
              comments: taskCommentSince,
            });
            // The board has no date window: its delta and id list are
            // workspace-wide. Only fetched while a board scope is claimed.
            const [boardDeltaRes, boardIdsRes] = reconcileBoard
              ? await Promise.all([
                fetchTaskDeltaSince(workspaceRef, taskSince),
                fetchBoardTaskIds(reconcileBoard),
              ])
              : [null, null];

            if (!isLifecycleActive(reconcileEpoch)) {
              break;
            }

            const boardError = (boardDeltaRes && 'error' in boardDeltaRes ? boardDeltaRes.error : null)
              ?? (boardIdsRes && 'error' in boardIdsRes ? boardIdsRes.error : null);
            if ('error' in changesRes || boardError) {
              console.error('error' in changesRes ? changesRes.error : boardError);
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

            const {
              changedTasks,
              changedMilestones,
              windowTaskIds,
              milestoneIds,
              commentedTaskIds,
            } = changesRes.data;

            const boardDeltaTasks = boardDeltaRes && 'data' in boardDeltaRes && reconcileBoard
              ? boardDeltaRes.data.filter((task) => isTaskInBoardScope(task, reconcileBoard))
              : [];
            if (changedTasks.length > 0 || boardDeltaTasks.length > 0) {
              upsertTasks([...changedTasks, ...boardDeltaTasks]);
            }
            if (changedMilestones.length > 0) {
              upsertMilestones(changedMilestones.map(mapMilestoneRow));
            }

            const remoteTaskIds = new Set(windowTaskIds);
            const remoteBoardIds = new Set(boardIdsRes && 'data' in boardIdsRes ? boardIdsRes.data : []);
            // A local task is stale when a scope it belongs to locally no
            // longer claims it remotely, and no other scope does either.
            const staleTaskIds = usePlannerStore.getState().tasks
              .filter((task) => {
                const inWindow = isTaskInWindow(task, rangeRef);
                const inBoard = reconcileBoard !== null && isTaskInBoardScope(task, reconcileBoard);
                if (!inWindow && !inBoard) return false;
                if (inWindow && remoteTaskIds.has(task.id)) return false;
                if (reconcileBoard && remoteBoardIds.has(task.id)) return false;
                return true;
              })
              .map((task) => task.id);
            if (staleTaskIds.length > 0) {
              removeTasksByIds(staleTaskIds);
            }

            // The id list above is the full workspace set (milestones are not
            // windowed), so any local milestone missing from it was deleted.
            const remoteMilestoneIds = new Set(milestoneIds);
            const staleMilestoneIds = usePlannerStore.getState().milestones
              .filter((milestone) => !remoteMilestoneIds.has(milestone.id))
              .map((milestone) => milestone.id);
            if (staleMilestoneIds.length > 0) {
              removeMilestonesByIds(staleMilestoneIds);
            }

            const taskCommentRefreshIds = new Set(commentedTaskIds);
            changedTasks.forEach((task) => {
              if (isTaskInWindow(task, rangeRef)) {
                taskCommentRefreshIds.add(task.id);
              }
            });
            boardDeltaTasks.forEach((task) => taskCommentRefreshIds.add(task.id));
            if (taskCommentRefreshIds.size > 0) {
              const taskCommentRefreshEpoch = lifecycleEpoch;
              const refreshResult = await refreshTaskCommentCounts(workspaceRef, Array.from(taskCommentRefreshIds));
              if (!isLifecycleActive(taskCommentRefreshEpoch)) {
                break;
              }
              if (refreshResult.error) {
                growFallbackFailures();
                continue;
              }
            }

            lastTaskSyncAtRef.current = nowIso;
            lastMilestoneSyncAtRef.current = nowIso;
            lastTaskCommentSyncAtRef.current = nowIso;
            lastReconcileCompletedAt = Date.now();
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
      // Events missed while disconnected are invisible to the time-off channel,
      // so a reconcile refetches its window too.
      void refreshTimeOff();
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

    // time_off is sparse (a handful of rows per workspace), so a realtime event
    // just refetches the loaded window instead of the per-id reconcile the tasks
    // pipeline needs. Debounced so a burst of edits costs one request.
    let timeOffRefreshTimer: number | null = null;
    const refreshTimeOff = async () => {
      if (!active) return;
      // rangeRef is the window this effect was built for — the same source the
      // task pipeline uses, and unlike store.loadedRange it is guaranteed to be
      // in sync with workspaceRef for the lifetime of this subscription.
      const timeOffRes = await fetchTimeOffRowsInWindow(workspaceRef, rangeRef);
      if (!active) return;
      if ('error' in timeOffRes) {
        console.error(timeOffRes.error);
        return;
      }
      usePlannerStore.getState().setTimeOff(timeOffRes.data.map(mapTimeOffRow));
    };

    const queueTimeOffRefresh = () => {
      if (!active || typeof window === 'undefined') return;
      if (timeOffRefreshTimer) window.clearTimeout(timeOffRefreshTimer);
      timeOffRefreshTimer = window.setTimeout(() => {
        timeOffRefreshTimer = null;
        void refreshTimeOff();
      }, EVENT_FLUSH_MS);
    };

    const queueTaskCommentCountRefresh = (taskId: string) => {
      pendingTaskCommentCountRefreshes.add(taskId);
      scheduleFlush();
    };

    const handleChannelStatus = (status: string, epoch: number) => {
      if (!active || epoch !== channelEpoch) return;
      if (status === 'SUBSCRIBED') {
        if (disconnectTimer) {
          clearTimeout(disconnectTimer);
          disconnectTimer = null;
        } else if (!channelHealthy) {
          toast.success(t`Connection restored`, {
            id: 'sync-status',
            position: 'bottom-right',
            duration: 3000,
          });
        }
        channelHealthy = true;
        usePlannerStore.getState().setSyncHealthy(true);
        resetFallbackFailures();
        clearFallbackTimer();
        if (!hasSubscribedOnce) {
          hasSubscribedOnce = true;
          if (typeof window === 'undefined') {
            requestReconcile('resubscribe');
            return;
          }
          clearInitialReconcileTimer();
          initialReconcileTimer = window.setTimeout(() => {
            initialReconcileTimer = null;
            requestReconcile('resubscribe');
          }, INITIAL_RECONCILE_DELAY_MS);
          return;
        }
        requestReconcile('resubscribe');
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        channelHealthy = false;
        usePlannerStore.getState().setSyncHealthy(false);
        if (!disconnectTimer) {
          disconnectTimer = setTimeout(() => {
            disconnectTimer = null;
            const compact = typeof window !== 'undefined'
              && window.matchMedia('(max-width: 767px)').matches;
            if (compact) {
              // Mobile: a compact icon-only badge on the right, instead of a
              // full-width text toast that would crowd the narrow screen.
              toast.custom(
                () => createElement(
                  'div',
                  {
                    className: 'flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg',
                    role: 'status',
                    'aria-label': t`No connection`,
                  },
                  createElement(WifiOff, { className: 'h-5 w-5' }),
                ),
                { id: 'sync-status', position: 'top-right', duration: Infinity },
              );
            } else {
              toast.error(t`No connection`, {
                id: 'sync-status',
                position: 'bottom-right',
                duration: Infinity,
              });
            }
          }, 5000);
        }
        clearInitialReconcileTimer();
        growFallbackFailures();
        requestReconcile('channel');
        scheduleFallbackPoll();
      }
    };

    const buildChannel = () => {
      const epoch = channelEpoch;
      return openPlannerLiveChannel(workspaceRef, {
        onTaskCommentChange: (taskId) => {
          if (!active) return;
          queueTaskCommentCountRefresh(taskId);
        },
        onTaskChange: ({ id, deleted }) => {
          if (!active) return;
          if (deleted) queueTaskDelete(id);
          else queueTaskUpsert(id);
        },
        onMilestoneChange: ({ id, deleted }) => {
          if (!active) return;
          if (deleted) queueMilestoneDelete(id);
          else queueMilestoneUpsert(id);
        },
        // Absences are few: a change refetches the window.
        onTimeOffChange: () => {
          if (!active) return;
          queueTimeOffRefresh();
        },
        onStatus: (status) => handleChannelStatus(status, epoch),
      });
    };

    let closeChannel = buildChannel();

    // When the tab regains focus or the network comes back, the realtime
    // client's internal reconnect/heartbeat timers may still be on a long
    // (background-throttled) backoff, leaving the "Нет соединения" banner
    // stuck until a manual reload. Tearing the channel down and rebuilding it
    // forces an immediate fresh JOIN — the same recovery a reload would do —
    // after which the SUBSCRIBED handler clears the banner.
    const forceReconnectChannel = async () => {
      if (!active || reconnectInFlight || channelHealthy) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const now = Date.now();
      if (now - lastReconnectAttemptAt < 4000) return;
      lastReconnectAttemptAt = now;
      reconnectInFlight = true;
      const closeStaleChannel = closeChannel;
      channelEpoch += 1;
      try {
        await closeStaleChannel();
      } catch (error) {
        console.error(error);
      } finally {
        reconnectInFlight = false;
      }
      if (!active) return;
      closeChannel = buildChannel();
    };

    const handleVisibilityOrFocus = () => {
      if (!canRunReconcileNow()) return;
      const now = Date.now();
      if (now - lastFocusReconcileAt < FOCUS_RECONCILE_COALESCE_MS) return;
      if (channelHealthy && now - lastReconcileCompletedAt < FOCUS_RECONCILE_MIN_INTERVAL_MS) return;
      lastFocusReconcileAt = now;
      requestReconcile('focus');
      if (!channelHealthy) {
        void forceReconnectChannel();
        scheduleFallbackPoll();
      }
    };

    const handleOnline = () => {
      if (!channelHealthy) {
        void forceReconnectChannel();
      }
      if (canRunReconcileNow()) {
        requestReconcile('focus');
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleVisibilityOrFocus);
      window.addEventListener('pageshow', handleVisibilityOrFocus);
      window.addEventListener('online', handleOnline);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
      }
    }

    return () => {
      active = false;
      lifecycleEpoch += 1;
      clearFlushTimer();
      clearFallbackTimer();
      clearInitialReconcileTimer();
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleVisibilityOrFocus);
        window.removeEventListener('pageshow', handleVisibilityOrFocus);
        window.removeEventListener('online', handleOnline);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
        }
      }
      void closeChannel();
    };
  }, [
    loadedRange,
    removeMilestonesByIds,
    refreshTaskCommentCounts,
    removeTasksByIds,
    upsertMilestones,
    upsertTasks,
    workspaceId,
  ]);
};
