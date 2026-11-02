import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '@lingui/macro';
import {
  declineInvite,
  deleteAllTaskNotifications,
  fetchInbox,
  isExportNotification,
  markAllTaskNotificationsRead,
  markTaskNotificationsReadForTask,
  subscribeToInboxChanges,
  updateTaskNotificationStatus,
  type PendingInvite,
  type TaskNotification,
} from '@/infrastructure/notifications/inboxRepository';
import {
  collectSeenTaskIds,
  findUnreadNotificationsForTasks,
  markAllNotificationsAsRead,
  markNotificationsAsReadByIds,
  removeNotificationsByIds,
} from '@/features/auth/lib/notificationReadState';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { toast } from '@/shared/ui/sonner';
import { roleLabel } from '@/features/auth/lib/inboxLabels';
import { useAppBasePath } from '@/features/demo/hooks/useIsDemo';
import { useInviteReactionToasts } from '@/features/auth/hooks/useInviteReactionToasts';
import { useAppIconBadge } from '@/shared/hooks/useAppIconBadge';
import { createTimeoutSlot } from '@/shared/lib/timeoutSlot';
import { scheduleWhenIdle } from '@/shared/lib/idleCallback';
import { inboxPollDelayMs } from '@/shared/domain/syncBackoff';

const getTodayIso = () => new Date().toISOString().slice(0, 10);
const SENT_UPDATES_REFRESH_MS = 10 * 60_000;
const REALTIME_REFRESH_DEBOUNCE_MS = 900;
const INITIAL_POLL_IDLE_TIMEOUT_MS = 1_500;

type PollingSource = 'initial' | 'timer' | 'focus' | 'open' | 'realtime';

export type TaskNotificationAction = 'markRead' | 'markUnread' | 'delete';

export interface InboxFeed {
  pendingInvites: PendingInvite[];
  taskNotifications: TaskNotification[];
  loading: boolean;
  errorMessage: string;
  unreadTaskCount: number;
  totalBadgeCount: number;
  badgeLabel: string;
  hasBadge: boolean;
  hasAnyNotifications: boolean;
  busyToken: string | null;
  busyNotificationId: string | null;
  bulkTaskActionBusy: boolean;
  openingNotificationId: string | null;
  /** Refresh on demand — used when the bell popover or the mobile screen opens. */
  refresh: () => void;
  acceptInvite: (token: string) => Promise<void>;
  declineInvite: (token: string) => Promise<void>;
  updateTaskNotification: (notificationId: string, action: TaskNotificationAction) => Promise<boolean>;
  markAllTaskNotificationsRead: () => Promise<void>;
  deleteAllTaskNotifications: () => Promise<void>;
  openTaskNotification: (notification: TaskNotification) => Promise<void>;
}

interface UseInboxFeedOptions {
  /**
   * Off for surfaces that must not talk to the backend (the /demo sandbox) — the
   * feed then stays empty and never polls, exactly like not rendering the bell.
   */
  enabled?: boolean;
  /**
   * Called when the feed navigates away from itself (invite accepted, task
   * opened): the bell closes its popover, the mobile stack closes its screen.
   */
  onDismiss?: () => void;
}

/**
 * Inbox state for the notification bell and its mobile equivalent: pending
 * invites, task notifications, the unread badge count, polling (with backoff,
 * focus/visibility refresh and a realtime nudge) and every row action.
 *
 * Exactly ONE instance may live at a time — it owns the polling loop. Desktop
 * mounts it inside `InviteNotifications`; mobile mounts it in the workspace
 * header (which needs the badge count for the avatar), and the two never render
 * together because the header branches on `useIsMobile`.
 */
export function useInboxFeed({ enabled = true, onDismiss }: UseInboxFeedOptions = {}): InboxFeed {
  const navigate = useNavigate();
  // The bell lives in the sandbox too: open the timeline of the section we are in.
  const basePath = useAppBasePath();
  const currentUser = useAuthStore((state) => state.user);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const fetchWorkspaces = useAuthStore((state) => state.fetchWorkspaces);
  const setCurrentWorkspaceId = useAuthStore((state) => state.setCurrentWorkspaceId);
  const acceptInviteRequest = useAuthStore((state) => state.acceptInvite);
  const setViewMode = usePlannerStore((state) => state.setViewMode);
  const setCurrentDate = usePlannerStore((state) => state.setCurrentDate);
  const requestScrollToDate = usePlannerStore((state) => state.requestScrollToDate);
  const clearFilters = usePlannerStore((state) => state.clearFilters);
  const setSelectedTaskId = usePlannerStore((state) => state.setSelectedTaskId);
  const setHighlightedTaskId = usePlannerStore((state) => state.setHighlightedTaskId);
  const selectedTaskId = usePlannerStore((state) => state.selectedTaskId);
  const highlightedTaskId = usePlannerStore((state) => state.highlightedTaskId);
  const peekedTaskId = usePlannerStore((state) => state.peekedTaskId);

  // A disabled feed behaves exactly like a signed-out one: no fetch, no timers.
  const user = enabled ? currentUser : null;

  const [loading, setLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [taskNotifications, setTaskNotifications] = useState<TaskNotification[]>([]);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null);
  const [bulkTaskAction, setBulkTaskAction] = useState<'markAllRead' | 'deleteAll' | null>(null);
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const [pollingTimer] = useState(createTimeoutSlot);
  const [realtimeRefreshTimer] = useState(createTimeoutSlot);
  const cancelInitialPollRef = useRef<(() => void) | null>(null);
  const pollingFailureCountRef = useRef(0);
  const pollingInFlightRef = useRef(false);
  const lastSentUpdatesSyncAtRef = useRef(0);
  const runPollingCycleRef = useRef<(source: PollingSource) => void>(() => {});


  const pendingCount = pendingInvites.length;
  const unreadTaskCount = useMemo(
    () => taskNotifications.filter((notification) => !notification.readAt).length,
    [taskNotifications],
  );
  const totalBadgeCount = pendingCount + unreadTaskCount;
  const hasBadge = totalBadgeCount > 0;
  const badgeLabel = useMemo(() => (totalBadgeCount > 9 ? '9+' : String(totalBadgeCount)), [totalBadgeCount]);

  useAppIconBadge(enabled, totalBadgeCount);
  const bulkTaskActionBusy = bulkTaskAction !== null;

  const applyInviteUpdateToasts = useInviteReactionToasts(user?.id ?? null);

  const loadInbox = useCallback(async (options?: {
    showLoading?: boolean;
    includeSentUpdates?: boolean;
  }) => {
    const showLoading = options?.showLoading ?? true;
    const includeSentUpdates = options?.includeSentUpdates ?? true;

    if (!user) {
      setPendingInvites([]);
      setTaskNotifications([]);
      setErrorMessage('');
      setLoading(false);
      return false;
    }

    if (showLoading) {
      setLoading(true);
    }

    setErrorMessage('');

    const { data, error } = await fetchInbox({
      limit: 60,
      pendingInviteLimit: 80,
      sentLimit: 140,
      includeSentUpdates,
    });

    if (error || !data) {
      setErrorMessage(error ?? t`Failed to load notifications.`);
      if (showLoading) {
        setLoading(false);
      }
      return false;
    }

    setPendingInvites(data.pendingInvites);
    setTaskNotifications(data.taskNotifications);

    if (includeSentUpdates) {
      applyInviteUpdateToasts(data.sentInvites);
    }

    if (showLoading) {
      setLoading(false);
    }

    return true;
  }, [applyInviteUpdateToasts, user]);

  const clearPollingTimer = pollingTimer.clear;
  const clearRealtimeRefreshTimer = realtimeRefreshTimer.clear;

  const clearInitialPollSchedule = useCallback(() => {
    cancelInitialPollRef.current?.();
    cancelInitialPollRef.current = null;
  }, []);

  const scheduleNextPollingCycle = useCallback(() => {
    if (!user || typeof window === 'undefined') return;
    if (typeof document !== 'undefined' && document.hidden) return;

    pollingTimer.set(
      () => runPollingCycleRef.current('timer'),
      inboxPollDelayMs(pollingFailureCountRef.current),
    );
  }, [pollingTimer, user]);

  const runPollingCycle = useCallback(async (source: PollingSource) => {
    if (!user || pollingInFlightRef.current) return;
    if (source === 'timer' && typeof document !== 'undefined' && document.hidden) return;

    pollingInFlightRef.current = true;
    const now = Date.now();
    const includeSentUpdates = source === 'realtime'
      ? false
      : source !== 'timer'
        || now - lastSentUpdatesSyncAtRef.current >= SENT_UPDATES_REFRESH_MS;
    const success = await loadInbox({
      showLoading: source !== 'timer' && source !== 'realtime',
      includeSentUpdates,
    });
    pollingInFlightRef.current = false;

    if (success) {
      pollingFailureCountRef.current = 0;
      if (includeSentUpdates) {
        lastSentUpdatesSyncAtRef.current = now;
      }
    } else {
      pollingFailureCountRef.current += 1;
    }

    if (source !== 'open') {
      scheduleNextPollingCycle();
    }
  }, [loadInbox, scheduleNextPollingCycle, user]);

  useEffect(() => {
    runPollingCycleRef.current = (source) => {
      void runPollingCycle(source);
    };
  }, [runPollingCycle]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (!user || typeof window === 'undefined') return;
    realtimeRefreshTimer.set(() => runPollingCycleRef.current('realtime'), REALTIME_REFRESH_DEBOUNCE_MS);
  }, [realtimeRefreshTimer, user]);

  useEffect(() => {
    if (!user) {
      clearInitialPollSchedule();
      clearPollingTimer();
      setPendingInvites([]);
      setTaskNotifications([]);
      setErrorMessage('');
      setLoading(false);
      return;
    }

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        clearPollingTimer();
        return;
      }
      clearInitialPollSchedule();
      void runPollingCycle('focus');
    };

    cancelInitialPollRef.current = scheduleWhenIdle(() => {
      cancelInitialPollRef.current = null;
      void runPollingCycle('initial');
    }, INITIAL_POLL_IDLE_TIMEOUT_MS);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      clearInitialPollSchedule();
      clearPollingTimer();
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [clearInitialPollSchedule, clearPollingTimer, runPollingCycle, user]);

  useEffect(() => {
    if (!user) {
      clearRealtimeRefreshTimer();
      return;
    }

    const unsubscribe = subscribeToInboxChanges(user.id, scheduleRealtimeRefresh);

    return () => {
      clearRealtimeRefreshTimer();
      unsubscribe();
    };
  }, [clearRealtimeRefreshTimer, scheduleRealtimeRefresh, user]);

  useEffect(() => {
    if (!user) {
      pollingFailureCountRef.current = 0;
      pollingInFlightRef.current = false;
      lastSentUpdatesSyncAtRef.current = 0;
      clearRealtimeRefreshTimer();
    }
  }, [clearRealtimeRefreshTimer, user]);

  const refresh = useCallback(() => {
    if (!user) return;
    void runPollingCycle('open');
  }, [runPollingCycle, user]);

  // Looking at a task means its notifications have been seen: read them here
  // as well, not only when the row is clicked in the bell. "Looking" is an open
  // card, a highlighted bar (the jump from a browser push or from the bell) or
  // the tap preview on a phone — and covers every loaded occurrence of the
  // task's repeat series. Only asks the server when this feed actually holds an
  // unread row for those tasks, so plain task clicks cost nothing. On failure
  // the next poll restores the truth.
  // Each notification is asked for once per session: if a refetch still shows
  // it unread, the server did not take it and asking again would only loop.
  const taskReadRequestedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const seenTaskIds = collectSeenTaskIds(
      usePlannerStore.getState().tasks,
      [selectedTaskId, highlightedTaskId, peekedTaskId],
    );
    const unread = findUnreadNotificationsForTasks(taskNotifications, seenTaskIds)
      .filter((notification) => !taskReadRequestedIdsRef.current.has(notification.id));
    if (unread.length === 0) return;

    const unreadIds = unread.map((notification) => notification.id);
    unreadIds.forEach((id) => taskReadRequestedIdsRef.current.add(id));
    setTaskNotifications((current) => (
      markNotificationsAsReadByIds(current, unreadIds, new Date().toISOString())
    ));
    const notifiedTaskIds = Array.from(new Set(unread.map((notification) => notification.taskId as string)));
    void Promise.all(notifiedTaskIds.map(markTaskNotificationsReadForTask)).then((results) => {
      if (results.some(({ error }) => error)) refresh();
    });
  }, [highlightedTaskId, peekedTaskId, refresh, selectedTaskId, taskNotifications, user]);

  const handleAccept = useCallback(async (token: string) => {
    const acceptedInvite = pendingInvites.find((invite) => invite.token === token) ?? null;
    setBusyToken(token);
    setErrorMessage('');

    const result = await acceptInviteRequest(token);
    if (result.error) {
      setErrorMessage(result.error);
      setBusyToken(null);
      return;
    }

    setPendingInvites((current) => current.filter((invite) => invite.token !== token));
    await fetchWorkspaces();
    if (!currentWorkspaceId && result.workspaceId) {
      setCurrentWorkspaceId(result.workspaceId);
    }

    toast(t`Workspace joined`, {
      description: acceptedInvite
        ? `${acceptedInvite.workspaceName} (${roleLabel(acceptedInvite.role)})`
        : t`You were added to a new workspace.`,
    });
    dismissRef.current?.();
    setBusyToken(null);
    void runPollingCycle('realtime');
  }, [
    acceptInviteRequest,
    currentWorkspaceId,
    fetchWorkspaces,
    pendingInvites,
    runPollingCycle,
    setCurrentWorkspaceId,
  ]);

  const handleDecline = useCallback(async (token: string) => {
    setBusyToken(token);
    setErrorMessage('');

    const { error } = await declineInvite(token);

    if (error) {
      setErrorMessage(error);
      setBusyToken(null);
      return;
    }

    setPendingInvites((current) => current.filter((invite) => invite.token !== token));
    setBusyToken(null);
  }, []);

  const updateTaskNotification = useCallback(async (
    notificationId: string,
    action: TaskNotificationAction,
  ) => {
    setBusyNotificationId(notificationId);
    setErrorMessage('');

    const { error } = await updateTaskNotificationStatus(notificationId, action);

    if (error) {
      setErrorMessage(error);
      setBusyNotificationId(null);
      return false;
    }

    setTaskNotifications((current) => {
      if (action === 'delete') {
        return current.filter((notification) => notification.id !== notificationId);
      }

      return current.map((notification) => {
        if (notification.id !== notificationId) return notification;
        return {
          ...notification,
          readAt: action === 'markRead' ? new Date().toISOString() : null,
        };
      });
    });

    setBusyNotificationId(null);
    return true;
  }, []);

  const handleMarkAllTaskNotificationsRead = useCallback(async () => {
    if (bulkTaskActionBusy || unreadTaskCount === 0) return;

    setBulkTaskAction('markAllRead');
    setErrorMessage('');

    const { error } = await markAllTaskNotificationsRead();

    if (error) {
      setErrorMessage(error);
      setBulkTaskAction(null);
      return;
    }

    const readAtIso = new Date().toISOString();
    setTaskNotifications((current) => markAllNotificationsAsRead(current, readAtIso));
    setBulkTaskAction(null);
  }, [bulkTaskActionBusy, unreadTaskCount]);

  const handleDeleteAllTaskNotifications = useCallback(async () => {
    if (bulkTaskActionBusy || taskNotifications.length === 0) return;

    setBulkTaskAction('deleteAll');
    setErrorMessage('');

    const notificationIds = taskNotifications.map((notification) => notification.id);
    const { error } = await deleteAllTaskNotifications();

    if (error) {
      setErrorMessage(error);
      setBulkTaskAction(null);
      return;
    }

    setTaskNotifications((current) => removeNotificationsByIds(current, notificationIds));
    setBulkTaskAction(null);
  }, [bulkTaskActionBusy, taskNotifications]);

  const handleOpenTaskNotification = useCallback(async (notification: TaskNotification) => {
    if (openingNotificationId) return;
    // Export lifecycle notifications are informational only — the actual download link
    // lives on the Data Export button inside Account Settings. Clicking them just marks
    // the row as read without navigation.
    if (isExportNotification(notification)) {
      if (!notification.readAt) {
        setOpeningNotificationId(notification.id);
        await updateTaskNotification(notification.id, 'markRead');
        setOpeningNotificationId(null);
      }
      return;
    }

    if (!notification.workspaceId) return;

    setOpeningNotificationId(notification.id);

    if (!notification.readAt) {
      await updateTaskNotification(notification.id, 'markRead');
    }

    // The task is gone (deleted -> task_id nulled, or otherwise missing). Don't
    // navigate to nowhere: tell the user why and leave the row marked read.
    if (!notification.taskId || !notification.taskExists || !notification.taskStartDate) {
      toast(t`This task has been deleted.`);
      setOpeningNotificationId(null);
      return;
    }

    if (currentWorkspaceId !== notification.workspaceId) {
      setCurrentWorkspaceId(notification.workspaceId);
    }

    setHighlightedTaskId(notification.taskId);
    clearFilters();
    if (user?.id && typeof window !== 'undefined') {
      window.localStorage.removeItem(`planner-filters-${user.id}`);
    }

    // Уведомление не несёт проект задачи, а сама задача часто ещё не загружена
    // (архив — это, как правило, старая работа вне текущего окна дат). Поэтому
    // не решаем здесь, а передаём намерение планировщику: он доведёт задачу до
    // экрана, когда та приедет.
    usePlannerStore.getState().setPendingRevealTaskId(notification.taskId);

    const scrollDate = notification.taskStartDate || getTodayIso();
    setViewMode('day');
    setCurrentDate(scrollDate);
    requestScrollToDate(scrollDate);

    // For comment_mention: open the task detail panel so comments are visible.
    // For task_assigned: just highlight in the timeline (existing behaviour).
    if (notification.type === 'comment_mention') {
      setSelectedTaskId(notification.taskId);
    } else {
      setSelectedTaskId(null);
    }

    dismissRef.current?.();
    navigate(basePath);
    setOpeningNotificationId(null);
  }, [
    basePath,
    clearFilters,
    currentWorkspaceId,
    navigate,
    openingNotificationId,
    requestScrollToDate,
    setCurrentDate,
    setCurrentWorkspaceId,
    setHighlightedTaskId,
    setSelectedTaskId,
    setViewMode,
    updateTaskNotification,
    user?.id,
  ]);

  return {
    pendingInvites,
    taskNotifications,
    loading,
    errorMessage,
    unreadTaskCount,
    totalBadgeCount,
    badgeLabel,
    hasBadge,
    hasAnyNotifications: pendingInvites.length > 0 || taskNotifications.length > 0,
    busyToken,
    busyNotificationId,
    bulkTaskActionBusy,
    openingNotificationId,
    refresh,
    acceptInvite: handleAccept,
    declineInvite: handleDecline,
    updateTaskNotification,
    markAllTaskNotificationsRead: handleMarkAllTaskNotificationsRead,
    deleteAllTaskNotifications: handleDeleteAllTaskNotifications,
    openTaskNotification: handleOpenTaskNotification,
  };
}
