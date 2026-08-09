import React from 'react';
import { Check } from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { SearchInput } from '@/shared/ui/SearchInput';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';

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
    <MobileScreenShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      toolbar={searchable ? (
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
      ) : undefined}
    >
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
    </MobileScreenShell>
  );
};
