import React from 'react';
import { cn } from '@/shared/lib/classNames';

/**
 * Shape every labelled floating action shares on a phone: pill-round, thumb
 * high, with room around the label. Kept here so the buttons on Projects,
 * Milestones, Customers, Contacts, Team and the dashboard cannot drift apart.
 * Icon-only FABs (the timeline's add-task) set their own round geometry.
 */
export const MOBILE_FAB_BUTTON_CLASS = 'h-12 gap-2 rounded-full px-5';

interface MobileFabProps {
  children: React.ReactNode;
  className?: string;
}

export const MobileFab: React.FC<MobileFabProps> = ({ children, className }) => (
  <div
    className={cn(
      'pointer-events-none fixed right-4 z-40 flex justify-end',
      // The same clearance the timeline's filter button and the calendar's
      // floating buttons use, so every round button on a phone sits on one line
      // and none of them lands in the screen's rounded corner.
      'bottom-[calc(env(safe-area-inset-bottom,0px)+2rem)]',
      '[&>*]:pointer-events-auto [&>*]:shadow-lg',
      className,
    )}
  >
    {children}
  </div>
);
