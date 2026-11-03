import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';

interface CalendarTodayButtonProps {
  /** Shown once the calendar was scrolled well away from where it opened. */
  visible: boolean;
  /** Which way today lies: the arrow points back to it. */
  scrollDirection: 'up' | 'down';
  onClick: () => void;
}

/** The floating "back to today" button of the calendar view. */
export const CalendarTodayButton: React.FC<CalendarTodayButtonProps> = ({ visible, scrollDirection, onClick }) => (
  <Button
    type="button"
    variant="secondary"
    size="icon"
    className={cn(
      // z-20: the day cells inside the scroller are `relative z-10`, and a
      // floating button left on z-auto is painted — and click-blocked —
      // by whichever week row happens to scroll under it.
      'absolute right-4 z-20 shadow-md transition-all duration-200 ease-out',
      // Lifted out of the phone's rounded corner, like the legend button
      // in the opposite one; the desktop keeps its old 16px.
      'bottom-[calc(env(safe-area-inset-bottom,0px)+2rem)] md:bottom-4',
      visible
        ? 'opacity-100 translate-y-0 pointer-events-auto'
        : 'opacity-0 translate-y-2 pointer-events-none'
    )}
    onClick={onClick}
    aria-label={t`Back to today`}
  >
    {scrollDirection === 'down' ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    )}
  </Button>
);
