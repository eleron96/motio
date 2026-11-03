import React from 'react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/classNames';

interface TimelineTodayButtonProps {
  isMobile: boolean;
  onClick: () => void;
}

/** The floating "Today" button, shown once today has scrolled out of view. */
export const TimelineTodayButton: React.FC<TimelineTodayButtonProps> = ({ isMobile, onClick }) => (
  <Button
    type="button"
    variant="secondary"
    className={cn(
      'absolute z-30 border border-border/80 bg-background/95 text-foreground shadow-[0_14px_34px_rgba(15,23,42,0.35)] backdrop-blur transition-shadow hover:shadow-[0_18px_40px_rgba(15,23,42,0.45)]',
      // On mobile the add-task FAB sits bottom-right, so stack "Today"
      // above it (same right edge) instead of overlapping it.
      isMobile
        ? 'right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+5.75rem)]'
        : 'bottom-6 right-6',
    )}
    onClick={onClick}
  >
    {t`Today`}
  </Button>
);
