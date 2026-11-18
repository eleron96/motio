import React from 'react';
import { cn } from '@/shared/lib/classNames';

interface ColorDotProps {
  /** Any CSS colour. Nothing is drawn without one. */
  color: string | null | undefined;
  /** Size and spacing; defaults to an 8px dot. */
  className?: string;
}

/**
 * A small round colour mark beside a name — a team, a project. Decorative: the
 * name next to it says the same thing, so screen readers skip it.
 */
export const ColorDot: React.FC<ColorDotProps> = ({ color, className }) => {
  if (!color) return null;
  return (
    <span
      aria-hidden="true"
      data-color-dot=""
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color }}
    />
  );
};
