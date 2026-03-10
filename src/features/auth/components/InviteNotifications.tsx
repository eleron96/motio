import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Mail, MailOpen, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { supabase } from '@/shared/lib/supabaseClient';
import { parseInvokeError } from '@/shared/lib/parseInvokeError';
import { cn } from '@/shared/lib/classNames';
import { markAllNotificationsAsRead } from '@/features/auth/lib/notificationReadState';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import type { WorkspaceRole } from '@/features/auth/store/authStore';
import { toast } from '@/shared/ui/sonner';
import { t } from '@lingui/macro';

type PendingInvite = {
  token: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  inviterDisplayName: string | null;
  inviterEmail: string | null;
};

type SentInviteSummary = {
  token: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired';
  respondedAt: string | null;
};

type TaskNotification = {
  id: string;
  type: 'task_assigned' | 'comment_mention';
  workspaceId: string;
  workspaceName: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  taskId: string | null;
  taskTitle: string;
  taskStartDate: string | null;
  taskExists: boolean;
  commentId: string | null;
  commentPreview: string | null;
  createdAt: string;
  readAt: string | null;
};

const isPendingInvite = (value: unknown): value is PendingInvite => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingInvite>;
  return (
    typeof candidate.token === 'string'
    && typeof candidate.workspaceId === 'string'
    && typeof candidate.workspaceName === 'string'
    && typeof candidate.role === 'string'
  );
};

const parsePendingInvites = (value: unknown): PendingInvite[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isPendingInvite);
};

const isSentInviteSummary = (value: unknown): value is SentInviteSummary => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SentInviteSummary>;
  return (
    typeof candidate.token === 'string'
    && typeof candidate.workspaceId === 'string'
    && typeof candidate.workspaceName === 'string'
    && typeof candidate.email === 'string'
    && typeof candidate.status === 'string'
  );
};

const parseSentInvites = (value: unknown): SentInviteSummary[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isSentInviteSummary);
};

const isTaskNotification = (value: unknown): value is TaskNotification => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TaskNotification>;
  return (
    typeof candidate.id === 'string'
    && (candidate.type === 'task_assigned' || candidate.type === 'comment_mention')
    && typeof candidate.workspaceId === 'string'
    && typeof candidate.workspaceName === 'string'
    && typeof candidate.taskTitle === 'string'
    && typeof candidate.createdAt === 'string'
  );
};

const parseTaskNotifications = (value: unknown): TaskNotification[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isTaskNotification);
};

const roleLabel = (role: WorkspaceRole) => {
  if (role === 'admin') return t`Admin`;
  if (role === 'editor') return t`Editor`;
  return t`Viewer`;
};

const formatNotificationDate = (isoDate: string) => {
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toLocaleString();
};

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

export const InviteNotifications: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const fetchWorkspaces = useAuthStore((state) => state.fetchWorkspaces);
  const setCurrentWorkspaceId = useAuthStore((state) => state.setCurrentWorkspaceId);
  const acceptInvite = useAuthStore((state) => state.acceptInvite);
  const setViewMode = usePlannerStore((state) => state.setViewMode);
  const setCurrentDate = usePlannerStore((state) => state.setCurrentDate);
  const requestScrollToDate = usePlannerStore((state) => state.requestScrollToDate);
  const clearFilters = usePlannerStore((state) => state.clearFilters);
  const setSelectedTaskId = usePlannerStore((state) => state.setSelectedTaskId);
  const setHighlightedTaskId = usePlannerStore((state) => state.setHighlightedTaskId);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [taskNotifications, setTaskNotifications] = useState<TaskNotification[]>([]);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null);
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

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

    const { data, error, response } = await supabase.functions.invoke('inbox', {
      body: {
        action: 'list',
        limit: 60,
        pendingInviteLimit: 80,
        sentLimit: 140,
        includeSentUpdates,
      },
    });

    if (error) {
      setErrorMessage(await parseInvokeError(error, response));
      if (showLoading) {
        setLoading(false);
      }
      return false;
    }

    const payload = (data as {
      invites?: unknown;
      notifications?: unknown;
      sentInvites?: unknown;
    } | null) ?? null;

    setPendingInvites(parsePendingInvites(payload?.invites));
    setTaskNotifications(parseTaskNotifications(payload?.notifications));

    if (includeSentUpdates) {
      applyInviteUpdateToasts(parseSentInvites(payload?.sentInvites));
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
    if (!open || !user) return;
    void runPollingCycle('open');
  }, [open, runPollingCycle, user]);

  useEffect(() => {
    if (!user) {
      clearRealtimeRefreshTimer();
      return;
    }

    const notificationsChannel = supabase
      .channel(`notifications-inbox-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          scheduleRealtimeRefresh();
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleRealtimeRefresh();
        }
      });

    return () => {
      clearRealtimeRefreshTimer();
      void supabase.removeChannel(notificationsChannel);
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

  const handleAccept = useCallback(async (token: string) => {
    const acceptedInvite = pendingInvites.find((invite) => invite.token === token) ?? null;
    setBusyToken(token);
    setErrorMessage('');

    const result = await acceptInvite(token);
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
    setOpen(false);
    setBusyToken(null);
    void runPollingCycle('realtime');
  }, [acceptInvite, currentWorkspaceId, fetchWorkspaces, pendingInvites, runPollingCycle, setCurrentWorkspaceId]);

  const handleDecline = useCallback(async (token: string) => {
    setBusyToken(token);
    setErrorMessage('');

    const { error, response } = await supabase.functions.invoke('invite', {
      body: { action: 'decline', token },
    });

    if (error) {
      setErrorMessage(await parseInvokeError(error, response));
      setBusyToken(null);
      return;
    }

    setPendingInvites((current) => current.filter((invite) => invite.token !== token));
    setBusyToken(null);
  }, []);

  const updateTaskNotification = useCallback(async (
    notificationId: string,
    action: 'markRead' | 'markUnread' | 'delete',
  ) => {
    setBusyNotificationId(notificationId);
    setErrorMessage('');

    const { error, response } = await supabase.functions.invoke('notifications', {
      body: { action, notificationId },
    });

    if (error) {
      setErrorMessage(await parseInvokeError(error, response));
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
    if (markAllBusy || unreadTaskCount === 0) return;

    setMarkAllBusy(true);
    setErrorMessage('');

    const { error, response } = await supabase.functions.invoke('notifications', {
      body: { action: 'markAllRead' },
    });

    if (error) {
      setErrorMessage(await parseInvokeError(error, response));
      setMarkAllBusy(false);
      return;
    }

    const readAtIso = new Date().toISOString();
    setTaskNotifications((current) => markAllNotificationsAsRead(current, readAtIso));
    setMarkAllBusy(false);
  }, [markAllBusy, unreadTaskCount]);

  const handleOpenTaskNotification = useCallback(async (notification: TaskNotification) => {
    if (openingNotificationId || !notification.taskId) return;

    setOpeningNotificationId(notification.id);

    if (!notification.readAt) {
      await updateTaskNotification(notification.id, 'markRead');
    }

    if (!notification.taskExists || !notification.taskStartDate) {
      toast(t`Task not found.`);
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
    setViewMode('week');
    setCurrentDate(scrollDate);
    requestScrollToDate(scrollDate);

    // For comment_mention: open the task detail panel so comments are visible.
    // For task_assigned: just highlight in the timeline (existing behaviour).
    if (notification.type === 'comment_mention') {
      setSelectedTaskId(notification.taskId);
    } else {
      setSelectedTaskId(null);
    }

    setOpen(false);
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

  const hasAnyNotifications = pendingInvites.length > 0 || taskNotifications.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={t`Notifications`}>
          <Bell className="h-4 w-4" />
          {hasBadge && (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {badgeLabel}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">{t`Notifications`}</div>
        <div className="max-h-[420px] space-y-4 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t`Loading data...`}</p>
          ) : !hasAnyNotifications ? (
            <p className="text-sm text-muted-foreground">{t`No notifications.`}</p>
          ) : (
            <>
              {taskNotifications.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t`Task updates`}</p>
                    {unreadTaskCount > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        disabled={markAllBusy || loading || openingNotificationId !== null || busyNotificationId !== null}
                        onClick={() => void handleMarkAllTaskNotificationsRead()}
                      >
                        {t`Mark as read`} ({unreadTaskCount})
                      </Button>
                    )}
                  </div>
                  {taskNotifications.map((notification) => {
                    const actorLabel = notification.actorDisplayName || notification.actorEmail || t`Unknown user`;
                    const isUnread = !notification.readAt;
                    const isBusy = markAllBusy || busyNotificationId === notification.id || openingNotificationId === notification.id;
                    const dateLabel = formatNotificationDate(notification.createdAt);
                    const markAsUnread = !isUnread;

                    return (
                      <div
                        key={notification.id}
                        className={cn(
                          'group rounded-md border p-3 transition-colors',
                          isUnread && 'border-primary/40 bg-primary/5',
                        )}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            {notification.type === 'comment_mention'
                              ? <>{actorLabel} {t`mentioned you in a comment`} · {notification.workspaceName}</>
                              : <>{actorLabel} {t`assigned you to task`} · {notification.workspaceName}</>
                            }
                          </p>
                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  disabled={isBusy}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void updateTaskNotification(notification.id, markAsUnread ? 'markUnread' : 'markRead');
                                  }}
                                >
                                  {markAsUnread ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                                  <span className="sr-only">{markAsUnread ? t`Mark as unread` : t`Mark as read`}</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {markAsUnread ? t`Mark as unread` : t`Mark as read`}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  disabled={isBusy}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void updateTaskNotification(notification.id, 'delete');
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span className="sr-only">{t`Delete`}</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t`Delete`}</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => void handleOpenTaskNotification(notification)}
                          disabled={isBusy}
                        >
                          <div className="text-sm font-medium">{notification.taskTitle}</div>
                          {notification.type === 'comment_mention' && notification.commentPreview && (
                            <div className="mt-1 truncate text-xs text-muted-foreground italic">
                              "{notification.commentPreview}"
                            </div>
                          )}
                          <div className="mt-1 text-xs text-muted-foreground">
                            {notification.taskExists ? t`Go to task` : t`Task not found.`}
                          </div>
                          {dateLabel && (
                            <div className="mt-1 text-[11px] text-muted-foreground">{dateLabel}</div>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {pendingInvites.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t`Invites`}</p>
                  {pendingInvites.map((invite) => {
                    const inviter = invite.inviterDisplayName || invite.inviterEmail || t`Unknown user`;
                    const isBusy = busyToken === invite.token;
                    return (
                      <div key={invite.token} className="rounded-md border p-3">
                        <div className="text-sm font-medium">{invite.workspaceName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{t`Role`}: {roleLabel(invite.role)}</div>
                        <div className="text-xs text-muted-foreground">{t`Invited by`}: {inviter}</div>
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-8 px-3"
                            onClick={() => void handleAccept(invite.token)}
                            disabled={isBusy}
                          >
                            {t`Accept`}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3"
                            onClick={() => void handleDecline(invite.token)}
                            disabled={isBusy}
                          >
                            {t`Decline`}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {errorMessage}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
