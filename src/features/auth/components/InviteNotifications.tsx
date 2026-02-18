import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Mail, MailOpen, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { supabase } from '@/shared/lib/supabaseClient';
import { cn } from '@/shared/lib/classNames';
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
  type: 'task_assigned';
  workspaceId: string;
  workspaceName: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  taskId: string | null;
  taskTitle: string;
  taskStartDate: string | null;
  taskExists: boolean;
  createdAt: string;
  readAt: string | null;
};

const parseFunctionError = async (error: { message: string }, response?: Response) => {
  let message = error.message;
  if (response) {
    try {
      const body = await response.clone().json();
      if (body && typeof body === 'object' && typeof (body as { error?: string }).error === 'string') {
        message = (body as { error: string }).error;
      }
    } catch (_error) {
      try {
        const text = await response.clone().text();
        if (text) message = text;
      } catch (_innerError) {
        // Ignore response parsing errors and keep the original message.
      }
    }
  }
  return message;
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
    && candidate.type === 'task_assigned'
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
  const [openingNotificationId, setOpeningNotificationId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const inviteReactionSeenRef = useRef<Set<string>>(new Set());
  const inviteReactionSessionStartedAtRef = useRef<number>(Date.now());

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

  const loadPendingInvites = useCallback(async () => {
    if (!user) {
      setPendingInvites([]);
      return true;
    }

    const { data, error, response } = await supabase.functions.invoke('invite', {
      body: { action: 'list' },
    });

    if (error) {
      setErrorMessage(await parseFunctionError(error, response));
      return false;
    }

    const payloadInvites = parsePendingInvites((data as { invites?: unknown } | null)?.invites);
    setPendingInvites(payloadInvites);
    return true;
  }, [user]);

  const loadTaskNotifications = useCallback(async () => {
    if (!user) {
      setTaskNotifications([]);
      return true;
    }

    const { data, error, response } = await supabase.functions.invoke('notifications', {
      body: { action: 'list' },
    });

    if (error) {
      setErrorMessage(await parseFunctionError(error, response));
      return false;
    }

    const parsed = parseTaskNotifications((data as { notifications?: unknown } | null)?.notifications);
    setTaskNotifications(parsed);
    return true;
  }, [user]);

  const loadSentInvites = useCallback(async (notifyOnUpdates = true) => {
    if (!user) return;

    const { data, error, response } = await supabase.functions.invoke('invite', {
      body: { action: 'listSent' },
    });

    if (error) {
      setErrorMessage(await parseFunctionError(error, response));
      return;
    }

    const sentInvites = parseSentInvites((data as { invites?: unknown } | null)?.invites);
    if (!notifyOnUpdates) return;

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
  }, [inviteReactionStorageKey, user]);

  const loadNotifications = useCallback(async (
    showLoading = true,
    notifyOnInviteUpdates = true,
  ) => {
    if (!user) {
      setPendingInvites([]);
      setTaskNotifications([]);
      setErrorMessage('');
      setLoading(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
    }

    setErrorMessage('');
    await Promise.all([
      loadPendingInvites(),
      loadTaskNotifications(),
      loadSentInvites(notifyOnInviteUpdates),
    ]);

    if (showLoading) {
      setLoading(false);
    }
  }, [loadPendingInvites, loadSentInvites, loadTaskNotifications, user]);

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
      setPendingInvites([]);
      setTaskNotifications([]);
      setErrorMessage('');
      setLoading(false);
      return;
    }

    void loadNotifications(true, false);
    const refreshTimer = window.setInterval(() => {
      void loadNotifications(false, true);
    }, 45000);

    return () => window.clearInterval(refreshTimer);
  }, [loadNotifications, user]);

  useEffect(() => {
    if (!open || !user) return;
    void loadNotifications(true, true);
  }, [loadNotifications, open, user]);

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
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.location.reload();
      }, 650);
    }
  }, [acceptInvite, currentWorkspaceId, fetchWorkspaces, pendingInvites, setCurrentWorkspaceId]);

  const handleDecline = useCallback(async (token: string) => {
    setBusyToken(token);
    setErrorMessage('');

    const { error, response } = await supabase.functions.invoke('invite', {
      body: { action: 'decline', token },
    });

    if (error) {
      setErrorMessage(await parseFunctionError(error, response));
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
      setErrorMessage(await parseFunctionError(error, response));
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
    setSelectedTaskId(null);
    setOpen(false);
    navigate('/');
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
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t`Task updates`}</p>
                  {taskNotifications.map((notification) => {
                    const actorLabel = notification.actorDisplayName || notification.actorEmail || t`Unknown user`;
                    const isUnread = !notification.readAt;
                    const isBusy = busyNotificationId === notification.id || openingNotificationId === notification.id;
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
                            {actorLabel} {t`assigned you to task`} · {notification.workspaceName}
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
