import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '@lingui/macro';
import {
  declineInvite,
  deleteAllTaskNotifications,
  fetchInbox,
  isExportNotification,
  markAllTaskNotificationsRead,
  subscribeToInboxChanges,
  updateTaskNotificationStatus,
  type PendingInvite,
  type SentInviteSummary,
  type TaskNotification,
} from '@/infrastructure/notifications/inboxRepository';
import {
  markAllNotificationsAsRead,
  removeNotificationsByIds,
} from '@/features/auth/lib/notificationReadState';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { toast } from '@/shared/ui/sonner';
import { roleLabel } from '@/features/auth/lib/inboxLabels';

const getTodayIso = () => new Date().toISOString().slice(0, 10);
const VISIBLE_POLL_BASE_MS = 75_000;
const VISIBLE_POLL_MAX_MS = 8 * 60_000;
const SENT_UPDATES_REFRESH_MS = 10 * 60_000;
const POLL_JITTER_RATIO = 0.2;
const REALTIME_REFRESH_DEBOUNCE_MS = 900;
const INITIAL_POLL_IDLE_TIMEOUT_MS = 1_500;

type PollingSource = 'initial' | 'timer' | 'focus' | 'open' | 'realtime';
type IdleSchedulerWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

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

  const inviteReactionSeenRef = useRef<Set<string>>(new Set());
  const inviteReactionSessionStartedAtRef = useRef<number>(Date.now());
  const pollingTimerRef = useRef<number | null>(null);
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const initialPollIdleRef = useRef<number | null>(null);
  const initialPollTimeoutRef = useRef<number | null>(null);
  const pollingFailureCountRef = useRef(0);
  const pollingInFlightRef = useRef(false);
  const lastSentUpdatesSyncAtRef = useRef(0);
  const runPollingCycleRef = useRef<(source: PollingSource) => void>(() => {});

  const inviteReactionStorageKey = user?.id ? `invite-reactions-seen-${user.id}` : null;
  const inviteReactionSessionStorageKey = user?.id ? `invite-reactions-session-started-${user.id}` : null;

  const pendingCount = pendingInvites.length;
  const unreadTaskCount = useMemo(
    () => taskNotifications.filter((notification) => !notification.readAt).length,
    [taskNotifications],
  );
  const totalBadgeCount = pendingCount + unreadTaskCount;
  const hasBadge = totalBadgeCount > 0;
  const badgeLabel = useMemo(() => (totalBadgeCount > 9 ? '9+' : String(totalBadgeCount)), [totalBadgeCount]);

  // Mirror the bell count onto the installed-PWA app icon (Badging API). Pushes
  // set the badge while the app is closed; this keeps it in sync — and clears
  // it — whenever the app is open and the count changes.
  useEffect(() => {
    // A disabled feed never counts anything, so it must not clear the badge the
    // enabled one just set (both are mounted on desktop, only one is live).
    if (!enabled) return;
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== 'function') return;
    if (totalBadgeCount > 0) {
      nav.setAppBadge(totalBadgeCount).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [totalBadgeCount]);
  const bulkTaskActionBusy = bulkTaskAction !== null;

  const applyInviteUpdateToasts = useCallback((sentInvites: SentInviteSummary[]) => {
    const now = Date.now();
    let seenChanged = false;

    sentInvites.forEach((invite) => {
      if (invite.status !== 'accepted' && invite.status !== 'declined') return;
      if (!invite.respondedAt) return;

      const respondedAtMs = Date.parse(invite.respondedAt);
      if (!Number.isFinite(respondedAtMs)) return;
      if (respondedAtMs < inviteReactionSessionStartedAtRef.current) return;
      if (now - respondedAtMs > 7 * 24 * 60 * 60 * 1000) return;

      const reactionKey = `${invite.token}:${invite.status}`;
      if (inviteReactionSeenRef.current.has(reactionKey)) return;

      inviteReactionSeenRef.current.add(reactionKey);
      seenChanged = true;
      const statusLabel = invite.status === 'accepted' ? t`Accepted` : t`Declined`;
      toast(t`Invite update`, {
        description: `${invite.email} ${statusLabel} (${invite.workspaceName})`,
      });
    });

    if (seenChanged && inviteReactionStorageKey && typeof window !== 'undefined') {
      const values = Array.from(inviteReactionSeenRef.current).slice(-400);
      window.localStorage.setItem(inviteReactionStorageKey, JSON.stringify(values));
    }
  }, [inviteReactionStorageKey]);

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

  const clearPollingTimer = useCallback(() => {
    if (pollingTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(pollingTimerRef.current);
    }
    pollingTimerRef.current = null;
  }, []);

  const clearRealtimeRefreshTimer = useCallback(() => {
    if (realtimeRefreshTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(realtimeRefreshTimerRef.current);
    }
    realtimeRefreshTimerRef.current = null;
  }, []);

  const clearInitialPollSchedule = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (initialPollTimeoutRef.current !== null) {
      window.clearTimeout(initialPollTimeoutRef.current);
      initialPollTimeoutRef.current = null;
    }
    if (initialPollIdleRef.current !== null) {
      const idleWindow = window as IdleSchedulerWindow;
      if (typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(initialPollIdleRef.current);
      }
      initialPollIdleRef.current = null;
    }
  }, []);

  const scheduleNextPollingCycle = useCallback(() => {
    if (!user || typeof window === 'undefined') return;
    if (typeof document !== 'undefined' && document.hidden) return;

    const failureCount = pollingFailureCountRef.current;
    const baseDelay = Math.min(VISIBLE_POLL_BASE_MS * (2 ** failureCount), VISIBLE_POLL_MAX_MS);
    const jitterWindow = Math.round(baseDelay * POLL_JITTER_RATIO);
    const jitter = Math.round((Math.random() * 2 - 1) * jitterWindow);
    const delayMs = Math.max(15_000, baseDelay + jitter);

    clearPollingTimer();
    pollingTimerRef.current = window.setTimeout(() => {
      runPollingCycleRef.current('timer');
    }, delayMs);
  }, [clearPollingTimer, user]);

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
    clearRealtimeRefreshTimer();
    realtimeRefreshTimerRef.current = window.setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      runPollingCycleRef.current('realtime');
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [clearRealtimeRefreshTimer, user]);

  useEffect(() => {
    if (!inviteReactionSessionStorageKey || typeof window === 'undefined') {
      inviteReactionSessionStartedAtRef.current = Date.now();
      return;
    }

    const storedSessionStart = Number(window.sessionStorage.getItem(inviteReactionSessionStorageKey));
    if (Number.isFinite(storedSessionStart) && storedSessionStart > 0) {
      inviteReactionSessionStartedAtRef.current = storedSessionStart;
      return;
    }

    const nextSessionStart = Date.now();
    inviteReactionSessionStartedAtRef.current = nextSessionStart;
    window.sessionStorage.setItem(inviteReactionSessionStorageKey, String(nextSessionStart));
  }, [inviteReactionSessionStorageKey]);

  useEffect(() => {
    if (!inviteReactionStorageKey || typeof window === 'undefined') {
      inviteReactionSeenRef.current = new Set();
      return;
    }

    try {
      const raw = window.localStorage.getItem(inviteReactionStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const values = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
      inviteReactionSeenRef.current = new Set(values);
    } catch (_error) {
      inviteReactionSeenRef.current = new Set();
    }
  }, [inviteReactionStorageKey]);

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

    const idleWindow = window as IdleSchedulerWindow;
    if (typeof idleWindow.requestIdleCallback === 'function') {
      initialPollIdleRef.current = idleWindow.requestIdleCallback(() => {
        initialPollIdleRef.current = null;
        void runPollingCycle('initial');
      }, { timeout: INITIAL_POLL_IDLE_TIMEOUT_MS });
    } else {
      initialPollTimeoutRef.current = window.setTimeout(() => {
        initialPollTimeoutRef.current = null;
        void runPollingCycle('initial');
      }, INITIAL_POLL_IDLE_TIMEOUT_MS);
    }
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
    navigate('/app');
    setOpeningNotificationId(null);
  }, [
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
