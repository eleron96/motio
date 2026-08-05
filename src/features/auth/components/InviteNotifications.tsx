import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { InboxPanel } from '@/features/auth/components/InboxPanel';
import { useInboxFeed } from '@/features/auth/hooks/useInboxFeed';
import { t } from '@lingui/macro';

/**
 * The desktop notification bell: badge + popover over {@link InboxPanel}.
 * All the state, polling and row actions live in {@link useInboxFeed}, which the
 * mobile header mounts instead (it needs the same count for the avatar badge).
 */
export const InviteNotifications: React.FC = () => {
  const [open, setOpen] = useState(false);
  const closePopover = useCallback(() => setOpen(false), []);
  const feed = useInboxFeed({ onDismiss: closePopover });
  const { refresh } = feed;

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={t`Notifications`}>
          <Bell className="h-4 w-4" />
          {feed.hasBadge && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center">
              <span
                aria-hidden="true"
                className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75"
              />
              <span className="relative inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground ring-2 ring-card">
                {feed.badgeLabel}
              </span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">{t`Notifications`}</div>
        <InboxPanel feed={feed} />
      </PopoverContent>
    </Popover>
  );
};
