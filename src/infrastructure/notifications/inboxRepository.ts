import { supabase } from '@/shared/lib/supabaseClient';
import { parseInvokeError } from '@/shared/lib/parseInvokeError';
import { invokeInviteFunction } from '@/infrastructure/auth/functionsGateway';
import { INVITE_ACTIONS } from '@/shared/contracts/actions';
import type { WorkspaceRole } from '@/features/auth/store/authStore';

export type PendingInvite = {
  token: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  inviterDisplayName: string | null;
  inviterEmail: string | null;
};

export type SentInviteSummary = {
  token: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired';
  respondedAt: string | null;
};

export type TaskNotification = {
  id: string;
  type: 'task_assigned' | 'comment_mention' | 'task_updated' | 'deadline_approaching' | 'export_ready' | 'export_failed';
  // Null for account-level notifications (data export lifecycle).
  workspaceId: string | null;
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

const NOTIFICATION_TYPES: ReadonlySet<TaskNotification['type']> = new Set([
  'task_assigned',
  'comment_mention',
  'task_updated',
  'deadline_approaching',
  'export_ready',
  'export_failed',
]);

export const isExportNotification = (notification: Pick<TaskNotification, 'type'>) => (
  notification.type === 'export_ready' || notification.type === 'export_failed'
);

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
    && typeof candidate.type === 'string'
    && NOTIFICATION_TYPES.has(candidate.type as TaskNotification['type'])
    // workspaceId is string for workspace-scoped types and null for export_* types.
    && (typeof candidate.workspaceId === 'string' || candidate.workspaceId === null)
    && typeof candidate.workspaceName === 'string'
    && typeof candidate.taskTitle === 'string'
    && typeof candidate.createdAt === 'string'
  );
};

const parseTaskNotifications = (value: unknown): TaskNotification[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isTaskNotification);
};

export type InboxSnapshot = {
  pendingInvites: PendingInvite[];
  taskNotifications: TaskNotification[];
  sentInvites: SentInviteSummary[];
};

export const fetchInbox = async (options: {
  limit: number;
  pendingInviteLimit: number;
  sentLimit: number;
  includeSentUpdates: boolean;
}): Promise<{ data?: InboxSnapshot; error?: string }> => {
  const { data, error, response } = await supabase.functions.invoke('inbox', {
    body: {
      action: 'list',
      limit: options.limit,
      pendingInviteLimit: options.pendingInviteLimit,
      sentLimit: options.sentLimit,
      includeSentUpdates: options.includeSentUpdates,
    },
  });

  if (error) {
    return { error: await parseInvokeError(error, response) };
  }

  const payload = (data as {
    invites?: unknown;
    notifications?: unknown;
    sentInvites?: unknown;
  } | null) ?? null;

  return {
    data: {
      pendingInvites: parsePendingInvites(payload?.invites),
      taskNotifications: parseTaskNotifications(payload?.notifications),
      sentInvites: parseSentInvites(payload?.sentInvites),
    },
  };
};

export const declineInvite = async (token: string): Promise<{ error?: string }> => {
  const result = await invokeInviteFunction({ action: INVITE_ACTIONS.DECLINE, token });
  return result.error ? { error: result.error } : {};
};

export type TaskNotificationAction = 'markRead' | 'markUnread' | 'delete';

export const updateTaskNotificationStatus = async (
  notificationId: string,
  action: TaskNotificationAction,
): Promise<{ error?: string }> => {
  const { error, response } = await supabase.functions.invoke('notifications', {
    body: { action, notificationId },
  });
  if (error) {
    return { error: await parseInvokeError(error, response) };
  }
  return {};
};

export const markAllTaskNotificationsRead = async (): Promise<{ error?: string }> => {
  const { error, response } = await supabase.functions.invoke('notifications', {
    body: { action: 'markAllRead' },
  });
  if (error) {
    return { error: await parseInvokeError(error, response) };
  }
  return {};
};

export const deleteAllTaskNotifications = async (): Promise<{ error?: string }> => {
  const { error, response } = await supabase.functions.invoke('notifications', {
    body: { action: 'deleteAll' },
  });
  if (error) {
    return { error: await parseInvokeError(error, response) };
  }
  return {};
};

// Subscribes to inbox-affecting changes for the user. `onChange` fires on every
// relevant database event and on channel degradation (error/timeout/closed) so
// the caller can fall back to a refresh. Returns an unsubscribe function.
export const subscribeToInboxChanges = (userId: string, onChange: () => void): (() => void) => {
  const channel = supabase
    .channel(`notifications-inbox-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_notifications',
        filter: `recipient_user_id=eq.${userId}`,
      },
      () => {
        onChange();
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onChange();
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
};
