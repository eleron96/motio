import React from 'react';
import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import { ChevronDown, RotateCw } from 'lucide-react';
import { RepeatSettingsFields } from '@/features/planner/components/RepeatSettingsFields';
import { RepeatEnds, RepeatFrequency } from '@/features/planner/lib/taskFormRules';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/classNames';

type RepeatPopoverFieldProps = {
  count: number;
  disabled?: boolean;
  ends: RepeatEnds;
  error?: string;
  frequency: RepeatFrequency;
  idPrefix: string;
  notice?: string;
  onCountInputChange: (value: string) => void;
  onEndsChange: (value: RepeatEnds) => void;
  onFrequencyChange: (value: RepeatFrequency) => void;
  onUntilChange: (value: string) => void;
  showNeverHint?: boolean;
  until: string;
};

const frequencyLabel = (frequency: RepeatFrequency) => {
  switch (frequency) {
    case 'daily': return t`Daily`;
    case 'weekly': return t`Weekly`;
    case 'biweekly': return t`Biweekly (every 2 weeks)`;
    case 'fourweekly': return t`Every 4 weeks`;
    case 'monthly': return t`Monthly`;
    case 'yearly': return t`Yearly`;
    default: return t`Does not repeat`;
  }
};

const formatUntil = (until: string) => {
  try {
    return format(parseISO(until), 'dd.MM.yyyy');
  } catch {
    return until;
  }
};

const buildRepeatSummary = (params: {
  count: number;
  ends: RepeatEnds;
  frequency: RepeatFrequency;
  until: string;
}) => {
  if (params.frequency === 'none') return frequencyLabel('none');
  const base = frequencyLabel(params.frequency);
  if (params.ends === 'on' && params.until) {
    return `${base} · ${t`until ${formatUntil(params.until)}`}`;
  }
  if (params.ends === 'after') {
    return `${base} · ×${params.count}`;
  }
  return base;
};

/**
 * Mockup-style repeat field: a select-like trigger showing a short summary
 * («Weekly · until 15.06.2026»), with the full repeat settings in a popover.
 * All state and validation stay in the parent — this only changes the shell.
 */
export const RepeatPopoverField: React.FC<RepeatPopoverFieldProps> = ({
  count,
  disabled = false,
  ends,
  error,
  frequency,
  idPrefix,
  notice,
  onCountInputChange,
  onEndsChange,
  onFrequencyChange,
  onUntilChange,
  showNeverHint = false,
  until,
}) => {
  const summary = buildRepeatSummary({ count, ends, frequency, until });
  const isOff = frequency === 'none';

  return (
    <div className="space-y-1">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t`Repeat settings`}
            className={cn(
              'flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {!isOff && <RotateCw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <span className={cn('flex-1 truncate text-left', isOff && 'text-muted-foreground')}>
              {summary}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3 p-3" align="start">
          <RepeatSettingsFields
            compact
            count={count}
            disabled={disabled}
            ends={ends}
            frequency={frequency}
            idPrefix={idPrefix}
            onCountInputChange={onCountInputChange}
            onEndsChange={onEndsChange}
            onFrequencyChange={onFrequencyChange}
            onUntilChange={onUntilChange}
            showNeverHint={showNeverHint}
            until={until}
          />
        </PopoverContent>
      </Popover>
      {error && <div className="text-xs text-destructive">{error}</div>}
      {notice && <div className="text-xs text-emerald-600">{notice}</div>}
    </div>
  );
};
