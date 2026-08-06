import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { MobilePickerScreen, type MobilePickerOption } from '@/shared/ui/mobile-picker-screen';

export interface ResponsiveSelectOption {
  value: string;
  label: string;
  /** Leading dot / emoji / avatar shown before the label. */
  leading?: React.ReactNode;
  disabled?: boolean;
}

interface ResponsiveSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ResponsiveSelectOption[];
  /** Title of the phone screen — say what is being chosen ("Status"). */
  title: string;
  placeholder: string;
  disabled?: boolean;
  triggerId?: string;
  triggerClassName?: string;
  /** Applied to the desktop `SelectValue`; keeps each call site's own look. */
  valueClassName?: string;
  /** Applied to the label inside each desktop `SelectItem`. */
  itemLabelClassName?: string;
  searchPlaceholder?: string;
  /** A search box appears on the phone once the list is at least this long. */
  searchableFrom?: number;
}

/**
 * One choice out of a short list: a Radix Select with a pointer, a full-screen
 * list with a finger.
 *
 * The phone half is not a nicety. A Select popup scrolls its own viewport with
 * hover-driven arrow buttons, which a touch never triggers, so anything past the
 * first screenful of options is unreachable — and the popup itself lands
 * wherever the layout viewport happens to be once the keyboard is up.
 */
export const ResponsiveSelect: React.FC<ResponsiveSelectProps> = ({
  value,
  onValueChange,
  options,
  title,
  placeholder,
  disabled = false,
  triggerId,
  triggerClassName,
  valueClassName,
  itemLabelClassName,
  searchPlaceholder,
  searchableFrom = 8,
}) => {
  const isMobile = useIsMobile();
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const selected = options.find((option) => option.value === value) ?? null;

  if (isMobile) {
    const pickerOptions: MobilePickerOption[] = options.map((option) => ({
      value: option.value,
      label: option.label,
      leading: option.leading,
      disabled: option.disabled,
    }));

    return (
      <>
        <button
          type="button"
          id={triggerId}
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            triggerClassName,
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              {selected.leading}
              <span className="truncate">{selected.label}</span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>

        <MobilePickerScreen
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title={title}
          options={pickerOptions}
          value={value}
          onValueChange={onValueChange}
          searchable={options.length >= searchableFrom}
          searchPlaceholder={searchPlaceholder}
        />
      </>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={triggerId} className={triggerClassName}>
        <SelectValue placeholder={placeholder} className={valueClassName} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.leading ? (
              <span className="inline-flex min-w-0 items-center gap-2">
                {option.leading}
                <span className={cn('truncate', itemLabelClassName)}>{option.label}</span>
              </span>
            ) : itemLabelClassName ? (
              <span className={itemLabelClassName}>{option.label}</span>
            ) : (
              option.label
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
