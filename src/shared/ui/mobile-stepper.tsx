import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';

interface MobileStepperProps {
  /** `null` means "not set" — the stepper shows `placeholder` until it is. */
  value: number | null;
  onChange: (next: number) => void;
  /** Value the first tap lands on when nothing is set yet. */
  fallback?: number;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

const format = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/**
 * A number you nudge with your thumb instead of typing: two 44px targets around
 * the current value. Replaces the desktop number input where a keyboard would
 * cover half the screen.
 */
export const MobileStepper: React.FC<MobileStepperProps> = ({
  value,
  onChange,
  fallback = 1,
  min = 1,
  max = 20,
  step = 1,
  placeholder,
  disabled,
  className,
  'aria-label': ariaLabel,
}) => {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.round(next * 100) / 100));
  const current = value ?? null;

  const nudge = (direction: 1 | -1) => {
    if (current === null) {
      onChange(clamp(fallback));
      return;
    }
    onChange(clamp(current + direction * step));
  };

  const atMin = current !== null && current <= min;
  const atMax = current !== null && current >= max;

  return (
    <span
      className={cn(
        // Reads as a control on the grey settings page, not as page background.
        'inline-flex shrink-0 items-center rounded-xl border border-border bg-background',
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => nudge(-1)}
        disabled={disabled || atMin}
        aria-label={`${ariaLabel ?? ''} −`.trim()}
        className="inline-flex h-11 w-11 items-center justify-center rounded-l-xl text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        className={cn(
          'min-w-[3rem] text-center text-[15px] font-semibold tabular-nums',
          current === null && 'text-xs font-normal text-muted-foreground',
        )}
      >
        {current === null ? (placeholder ?? '—') : format(current)}
      </span>
      <button
        type="button"
        onClick={() => nudge(1)}
        disabled={disabled || atMax}
        aria-label={`${ariaLabel ?? ''} +`.trim()}
        className="inline-flex h-11 w-11 items-center justify-center rounded-r-xl text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" />
      </button>
    </span>
  );
};
