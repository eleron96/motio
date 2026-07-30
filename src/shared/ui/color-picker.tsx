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
  'aria-label'?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  disabled = false,
  presets = PROJECT_PRESET_COLORS,
  allowCustom = true,
  'aria-label': ariaLabel,
}) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'w-6 h-6 rounded-full border-2 border-border transition-transform flex-shrink-0',
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110',
          )}
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
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
              style={{ backgroundColor: color }}
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
      </PopoverContent>
    </Popover>
  );
};
