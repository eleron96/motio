import * as React from 'react';
import { X } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/classNames';

interface SearchInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'className'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Wrapper class — use for width/layout, e.g. "w-full sm:w-[220px]". */
  className?: string;
  /** Input class — use for input-specific styles, e.g. "h-8". */
  inputClassName?: string;
  /** Localized aria-label for the clear button. */
  clearLabel?: string;
}

/**
 * Text input with a semi-transparent clear (✕) button that appears once there
 * is a value, so users can reset the field in one click instead of deleting
 * character by character.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onValueChange, className, inputClassName, clearLabel = 'Clear', ...props }, ref) => (
    <div className={cn('relative', className)}>
      <Input
        ref={ref}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(value ? 'pr-8' : undefined, inputClassName)}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange('')}
          aria-label={clearLabel}
          className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-sm p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  ),
);
SearchInput.displayName = 'SearchInput';
