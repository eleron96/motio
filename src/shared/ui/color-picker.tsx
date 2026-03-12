import React from 'react';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/classNames';
import { PROJECT_PRESET_COLORS } from '@/shared/lib/colors';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, disabled = false }) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'w-6 h-6 rounded-full border-2 border-border transition-transform flex-shrink-0',
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110',
          )}
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="end">
        <div className="flex flex-wrap gap-2 max-w-[180px]">
          {PROJECT_PRESET_COLORS.map(color => (
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
          <Input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-6 h-6 p-0 border-0 cursor-pointer"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
