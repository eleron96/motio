import React from 'react';
import { t } from '@lingui/macro';
import { InboxPanel } from '@/features/auth/components/InboxPanel';
import type { InboxFeed } from '@/features/auth/hooks/useInboxFeed';
import { MobileStackScreen } from '@/shared/ui/mobile-stack-screen';

interface MobileNotificationsScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Back to the menu sheet. */
  onBack: () => void;
  feed: InboxFeed;
}

/** The bell's popover as a full screen: invites and task updates under the thumb. */
export const MobileNotificationsScreen: React.FC<MobileNotificationsScreenProps> = ({
  open,
  onOpenChange,
  onBack,
  feed,
}) => {
  const { refresh } = feed;

  React.useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  return (
    <MobileStackScreen
      open={open}
      onOpenChange={onOpenChange}
      title={t`Notifications`}
      description={t`Open invites and task updates.`}
      onBack={onBack}
      sections={[{
        id: 'all',
        label: t`Notifications`,
        // The panel brings its own padding and scroller.
        padded: false,
        content: <InboxPanel feed={feed} variant="screen" />,
      }]}
      activeId="all"
      onActiveChange={() => {}}
    />
  );
};
