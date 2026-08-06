import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ChevronLeft } from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { SearchInput } from '@/shared/ui/SearchInput';
import { useKeyboardOffset } from '@/shared/hooks/useKeyboardOffset';
import { useBackSwipe } from '@/shared/hooks/useBackSwipe';

export interface MobilePickerOption {
  value: string;
  label: React.ReactNode;
  /** Small line under the label (project code, role, hint). */
  subtitle?: React.ReactNode;
  /** Leading dot/avatar/icon. */
  leading?: React.ReactNode;
  /** Right-aligned note, e.g. "(archived)". */
  note?: React.ReactNode;
  disabled?: boolean;
  /** Text the search box matches against; defaults to a string `label`. */
  searchText?: string;
}

interface MobilePickerScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: MobilePickerOption[];
  /** Single mode: the chosen value. Ignored when `values` is given. */
  value?: string;
  onValueChange?: (value: string) => void;
  /**
   * Multi mode: the chosen values. Rows become checkboxes and the screen stays
   * open as you tick them — you leave with Back.
   */
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  /** Show a search field above the list. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /**
   * Matching rule for the search box. Pass the same predicate the desktop path
   * uses, so one field cannot end up with two search semantics.
   */
  filter?: (option: MobilePickerOption, query: string) => boolean;
}

/**
 * Picking one option out of a list, phone-style: a full-screen list you scroll
 * with a finger, not a dropdown floating over the form.
 *
 * A Radix Select popup is the wrong shape here — its viewport does its own
 * scrolling with arrow buttons and a nested scroller inside it never gets the
 * touch, so on a phone a long list simply cannot be reached. A plain screen
 * with a plain scroller always can.
 */
export const MobilePickerScreen: React.FC<MobilePickerScreenProps> = ({
  open,
  onOpenChange,
  title,
  options,
  value,
  onValueChange,
  values,
  onValuesChange,
  searchable = false,
  searchPlaceholder,
  emptyLabel,
  filter,
}) => {
  const [query, setQuery] = React.useState('');
  const { offset: keyboardOffset, height: viewportHeight } = useKeyboardOffset();
  const backSwipe = useBackSwipe(() => onOpenChange(false));

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const visible = React.useMemo(() => {
    const needle = query.trim();
    if (!needle) return options;
    if (filter) return options.filter((option) => filter(option, needle));
    const lowered = needle.toLowerCase();
    return options.filter((option) => {
      const haystack = option.searchText
        ?? (typeof option.label === 'string' ? option.label : '');
      return haystack.toLowerCase().includes(lowered);
    });
  }, [filter, options, query]);

  const multiple = Array.isArray(values);

  const pick = (option: MobilePickerOption) => {
    if (option.disabled) return;
    if (multiple) {
      const current = values ?? [];
      const next = current.includes(option.value)
        ? current.filter((item) => item !== option.value)
        : [...current, option.value];
      onValuesChange?.(next);
      // Stays open: ticking several boxes in a row is the whole point.
      return;
    }
    onValueChange?.(option.value);
    onOpenChange(false);
  };

  const isSelected = (option: MobilePickerOption) => (
    multiple ? (values ?? []).includes(option.value) : option.value === value
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          aria-describedby={undefined}
          className={cn(
            // z-[60]: the picker opens on top of a MobileFormScreen (z-50).
            'fixed inset-x-0 z-[60] flex flex-col bg-muted outline-none',
            'duration-300 data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          )}
          style={{
            // The search field opens the keyboard, so the same bottom-anchored
            // geometry as MobileFormScreen: the list ends where the keyboard
            // starts and the header stays on screen.
            bottom: keyboardOffset,
            height: viewportHeight ? `${viewportHeight}px` : '100svh',
            transition: 'bottom 150ms ease-out',
          }}
          // Swipe right to go back, the way the platform trains you to expect.
          {...backSwipe}
        >
          <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-1.5 pt-[env(safe-area-inset-top,0px)]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t`Back`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate pr-11 text-center text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
          </header>

          {searchable && (
            <div className="shrink-0 border-b border-border bg-card px-3.5 py-2.5">
              <SearchInput
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder ?? t`Search`}
                className="w-full"
                inputClassName="h-11 rounded-xl"
                clearLabel={t`Clear`}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
              />
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {visible.map((option, index) => {
                const selected = isSelected(option);
                return (
                  <React.Fragment key={option.value}>
                    {index > 0 && <div className="ml-4 h-px bg-border" />}
                    <button
                      type="button"
                      onClick={() => pick(option)}
                      disabled={option.disabled}
                      {...(multiple
                        ? { role: 'checkbox' as const, 'aria-checked': selected }
                        : { 'aria-pressed': selected })}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        option.disabled ? 'opacity-50' : 'active:bg-muted/60',
                      )}
                      style={{ minHeight: 56 }}
                    >
                      {option.leading}
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium leading-tight">
                          {option.label}
                        </span>
                        {option.subtitle && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {option.subtitle}
                          </span>
                        )}
                      </span>
                      {option.note && (
                        <span className="shrink-0 text-xs text-muted-foreground">{option.note}</span>
                      )}
                      {multiple ? (
                        // A box you tick, so it is obvious several can be on at
                        // once — a lone check mark reads as "the chosen one".
                        <span
                          aria-hidden="true"
                          className={cn(
                            'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border-[1.5px]',
                            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                          )}
                        >
                          {selected && <Check className="h-4 w-4" />}
                        </span>
                      ) : (
                        selected && <Check className="h-[18px] w-[18px] shrink-0 text-foreground" />
                      )}
                    </button>
                  </React.Fragment>
                );
              })}

              {visible.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {emptyLabel ?? t`Nothing found`}
                </div>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
