import React from 'react';
import { Mail, MailOpen, Trash2 } from 'lucide-react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { cn } from '@/shared/lib/classNames';
import { isExportNotification } from '@/infrastructure/notifications/inboxRepository';
import { formatNotificationDate, roleLabel } from '@/features/auth/lib/inboxLabels';
import type { InboxFeed } from '@/features/auth/hooks/useInboxFeed';

interface InboxPanelProps {
  feed: InboxFeed;
  /**
   * `popover` is the desktop bell: hover-revealed row actions, capped height.
   * `screen` is the mobile stack screen: actions always visible and finger-sized,
   * the panel fills the screen and scrolls on its own.
   */
  variant?: 'popover' | 'screen';
}

export const InboxPanel: React.FC<InboxPanelProps> = ({ feed, variant = 'popover' }) => {
  const {
    pendingInvites,
    taskNotifications,
    loading,
    errorMessage,
    unreadTaskCount,
    hasAnyNotifications,
    busyToken,
    busyNotificationId,
    bulkTaskActionBusy,
    openingNotificationId,
  } = feed;

  const isScreen = variant === 'screen';
  const actionsBusy = bulkTaskActionBusy || loading || openingNotificationId !== null || busyNotificationId !== null;

  const renderRowAction = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled: boolean,
  ) => {
    const button = (
      <Button
        variant="ghost"
        size="icon"
        className={isScreen ? 'h-9 w-9' : 'h-6 w-6'}
        disabled={disabled}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
      >
        {icon}
        <span className="sr-only">{label}</span>
      </Button>
    );

    // No hover on a touch screen — a tooltip there is dead weight (and it would
    // fire on tap, competing with the button's own action).
    if (isScreen) return button;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div
      className={cn(
        'space-y-4',
        isScreen
          ? 'h-full overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]'
          : 'max-h-[420px] overflow-y-auto p-4',
      )}
    >
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
                <div className="flex items-center gap-1">
                  {unreadTaskCount > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn('px-2 text-xs', isScreen ? 'h-9' : 'h-6')}
                      disabled={actionsBusy}
                      onClick={() => void feed.markAllTaskNotificationsRead()}
                    >
                      {t`Mark as read`} ({unreadTaskCount})
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn('px-2 text-xs text-muted-foreground hover:text-foreground', isScreen ? 'h-9' : 'h-6')}
                    disabled={actionsBusy}
                    onClick={() => void feed.deleteAllTaskNotifications()}
                  >
                    {t`Delete all`}
                  </Button>
                </div>
              </div>
              {taskNotifications.map((notification) => {
                const actorLabel = notification.actorDisplayName || notification.actorEmail || t`Unknown user`;
                const isUnread = !notification.readAt;
                const isBusy = bulkTaskActionBusy
                  || busyNotificationId === notification.id
                  || openingNotificationId === notification.id;
                const dateLabel = formatNotificationDate(notification.createdAt);
                const markAsUnread = !isUnread;
                const isExport = isExportNotification(notification);
                // The referenced task no longer exists (deleted). The row is
                // kept (with its title snapshot) but shown as unavailable.
                const taskGone = !isExport && (!notification.taskId || !notification.taskExists);

                // Secondary line: who acted (and where), shown under the title.
                // The last branch is a NEUTRAL catch-all, not "assigned":
                // a type this build doesn't know must never invent an
                // actor ("Unknown user assigned you…") — see the inbox
                // mapper regression this mirrors.
                const subNode = notification.type === 'task_assigned'
                  ? <>{actorLabel} {t`assigned you to task`} · {notification.workspaceName}</>
                  : notification.type === 'comment_mention'
                    ? <>{actorLabel} {t`mentioned you in a comment`} · {notification.workspaceName}</>
                    : notification.type === 'task_updated'
                      ? <>{actorLabel} {t`updated a task`} · {notification.workspaceName}</>
                      : notification.type === 'export_ready'
                        ? <>{t`Open Account settings to download the file.`}</>
                        : notification.type === 'export_failed'
                          ? <>{t`Try again from Account settings.`}</>
                          : <>{t`Task update`} · {notification.workspaceName}</>;

                const titleText = isExport
                  ? (notification.type === 'export_ready'
                    ? t`Your data export is ready.`
                    : t`Your data export failed.`)
                  : notification.taskTitle;

                return (
                  // Whole card is clickable (opens the task / marks export read).
                  // The action icons stop propagation so they keep their own click.
                  <div
                    key={notification.id}
                    role="button"
                    tabIndex={isBusy ? -1 : 0}
                    aria-disabled={isBusy || undefined}
                    onClick={() => { if (!isBusy) void feed.openTaskNotification(notification); }}
                    onKeyDown={(event) => {
                      if (isBusy) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void feed.openTaskNotification(notification);
                      }
                    }}
                    className={cn(
                      'group relative cursor-pointer rounded-md border text-left transition-all duration-150',
                      isScreen ? 'p-3.5' : 'p-2.5',
                      'hover:border-primary/50 hover:shadow-sm',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      'active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100',
                      // Unread rows carry the accent (left bar + tinted fill + bold
                      // title); read rows stay flat and muted, so the difference is
                      // obvious at a glance instead of a barely-there tint. Hover
                      // deepens each row's own fill instead of flattening unread
                      // ones into the neutral accent.
                      isUnread
                        ? 'border-primary/60 bg-primary/10 pl-4 shadow-sm hover:bg-primary/[0.16]'
                        : 'border-border bg-card hover:bg-accent',
                      isBusy && 'pointer-events-none opacity-60',
                    )}
                  >
                    {isUnread && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 left-1 w-1 rounded-full bg-primary"
                      />
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'truncate text-sm leading-snug',
                          isUnread ? 'font-semibold text-foreground' : 'font-normal text-foreground/80',
                          taskGone && 'text-muted-foreground line-through',
                        )}>
                          {isUnread && <span className="sr-only">{t`Unread`}: </span>}
                          {titleText}
                        </p>
                        {!isExport && notification.type === 'comment_mention' && notification.commentPreview && (
                          <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
                            "{notification.commentPreview}"
                          </p>
                        )}
                        {isExport && notification.commentPreview && (
                          <p className={cn(
                            'mt-0.5 truncate text-xs',
                            notification.type === 'export_failed' ? 'text-destructive' : 'text-muted-foreground',
                          )}>
                            {notification.commentPreview}
                          </p>
                        )}
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{subNode}</p>
                        {taskGone && (
                          <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                            {t`Task deleted`}
                          </p>
                        )}
                        {dateLabel && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{dateLabel}</p>
                        )}
                      </div>
                      <div className={cn(
                        '-mr-1 -mt-0.5 flex shrink-0 items-center gap-0.5 transition-opacity',
                        isScreen
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                      )}>
                        {renderRowAction(
                          markAsUnread ? t`Mark as unread` : t`Mark as read`,
                          markAsUnread
                            ? <Mail className={isScreen ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
                            : <MailOpen className={isScreen ? 'h-4 w-4' : 'h-3.5 w-3.5'} />,
                          () => void feed.updateTaskNotification(notification.id, markAsUnread ? 'markUnread' : 'markRead'),
                          isBusy,
                        )}
                        {renderRowAction(
                          t`Delete`,
                          <Trash2 className={isScreen ? 'h-4 w-4' : 'h-3.5 w-3.5'} />,
                          () => void feed.updateTaskNotification(notification.id, 'delete'),
                          isBusy,
                        )}
                      </div>
                    </div>
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
                        className={cn('px-3', isScreen ? 'h-11 flex-1' : 'h-8')}
                        onClick={() => void feed.acceptInvite(invite.token)}
                        disabled={isBusy}
                      >
                        {t`Accept`}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn('px-3', isScreen ? 'h-11 flex-1' : 'h-8')}
                        onClick={() => void feed.declineInvite(invite.token)}
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
  );
};
