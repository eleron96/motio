import React from 'react';
import { cn } from '@/shared/lib/classNames';

/** Uppercase section label used by the task composer panels («Information» / «Parameters»). */
export const ComposerEyebrow: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => (
  <div
    className={cn(
      'flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground',
      className,
    )}
  >
    {children}
  </div>
);
