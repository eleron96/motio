import React from 'react';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/classNames';
import { PROJECT_PRESET_COLORS } from '@/shared/lib/colors';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  /** Swatches offered in the popover. Defaults to the project palette. */
  presets?: readonly string[];
  /**
   * Native colour input alongside the swatches. Turn it off where an arbitrary
   * colour would break the surface it lands on — a person's colour becomes the
   * background of a calendar day circle with the day number drawn on top, so it
   * has to stay within the pastel presets.
   */
  allowCustom?: boolean;
  /**
   * The tone a swatch is DRAWN in, when it differs from the stored value: a
   * team's colour is stored as a pastel but shown as a deeper dot, and the
   * picker should offer what will actually appear. `value` and `onChange` keep
   * speaking in stored colours.
   */
  swatchColor?: (color: string) => string;
  /**
   * Which edge of the swatch the popover lines up with. `end` (the default)
   * suits a swatch at the right end of a row; a swatch at the left edge of a
   * panel wants `start`, or the popover hangs over whatever is left of it.
   */
  align?: 'start' | 'center' | 'end';
  /** "Back to automatic": a text button under the swatches, when given. */
  onReset?: () => void;
  resetLabel?: string;
  'aria-label'?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  disabled = false,
  presets = PROJECT_PRESET_COLORS,
  allowCustom = true,
  swatchColor,
  align = 'end',
  onReset,
  resetLabel,
  'aria-label': ariaLabel,
}) => {
  const draw = (color: string) => (swatchColor ? swatchColor(color) : color);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          title={ariaLabel}
          className={cn(
            'w-6 h-6 rounded-full border-2 border-border transition-transform flex-shrink-0',
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110',
          )}
          style={{ backgroundColor: draw(value) }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align={align}>
        <div className="flex flex-wrap gap-2 max-w-[180px]">
          {presets.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              disabled={disabled}
              className={cn(
                'w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                value === color ? 'border-foreground scale-110' : 'border-transparent'
              )}
              style={{ backgroundColor: draw(color) }}
            />
          ))}
          {allowCustom && (
            <Input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="w-6 h-6 p-0 border-0 cursor-pointer"
            />
          )}
        </div>
        {onReset && resetLabel && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            className="mt-2 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {resetLabel}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};
