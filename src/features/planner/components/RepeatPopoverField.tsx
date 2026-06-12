import React from 'react';
import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import { Check, ChevronDown, RotateCw } from 'lucide-react';
import { formatRepeatCountInputValue, RepeatEnds, RepeatFrequency } from '@/features/planner/lib/taskFormRules';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
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

const FREQUENCY_OPTIONS: Array<Exclude<RepeatFrequency, 'none'>> = [
  'daily',
  'weekly',
  'biweekly',
  'fourweekly',
  'monthly',
  'yearly',
];

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

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
    {children}
  </div>
);

const OptionRow: React.FC<{
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}> = ({ selected, disabled = false, onSelect, children }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onSelect}
    className={cn(
      'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm',
      'hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50',
      selected && 'bg-accent/60 font-medium',
    )}
  >
    <span className="truncate">{children}</span>
    <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
  </button>
);

/**
 * Mockup-style repeat field: a select-like trigger showing a short summary
 * («Weekly · until 15.06.2026»), with a popover holding a «repeat task»
 * toggle plus frequency / limit option lists with checkmarks.
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
  const switchId = `${idPrefix}-repeat-switch`;
  const untilId = `${idPrefix}-repeat-until`;
  const countId = `${idPrefix}-repeat-count`;

  const hint = ends === 'on'
    ? t`Repeats until the selected date.`
    : ends === 'after'
      ? t`Creates the specified number of repeats.`
      : showNeverHint
        ? t`Creates repeats for the next 12 months.`
        : '';

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
        <PopoverContent className="w-72 p-1.5" align="start">
          <div className="flex items-center justify-between gap-3 rounded-md px-2.5 py-2">
            <label htmlFor={switchId} className="flex-1 cursor-pointer text-sm">{t`Repeat task`}</label>
            <Switch
              id={switchId}
              checked={!isOff}
              disabled={disabled}
              onCheckedChange={(checked) => onFrequencyChange(checked ? 'daily' : 'none')}
            />
          </div>

          {!isOff && (
            <>
              <div className="my-1 h-px bg-border" />

              <SectionHeading>{t`Repeat type`}</SectionHeading>
              {FREQUENCY_OPTIONS.map((option) => (
                <OptionRow
                  key={option}
                  selected={frequency === option}
                  disabled={disabled}
                  onSelect={() => onFrequencyChange(option)}
                >
                  {frequencyLabel(option)}
                </OptionRow>
              ))}

              <SectionHeading>{t`Repeat limit`}</SectionHeading>
              <OptionRow selected={ends === 'never'} disabled={disabled} onSelect={() => onEndsChange('never')}>
                {t`Never`}
              </OptionRow>
              <OptionRow selected={ends === 'on'} disabled={disabled} onSelect={() => onEndsChange('on')}>
                {t`Until date`}
              </OptionRow>
              <OptionRow selected={ends === 'after'} disabled={disabled} onSelect={() => onEndsChange('after')}>
                {t`Count`}
              </OptionRow>

              {ends === 'on' && (
                <div className="px-1.5 pb-1 pt-1.5">
                  <Input
                    id={untilId}
                    aria-label={t`End date`}
                    type="date"
                    value={until}
                    onChange={(event) => onUntilChange(event.target.value)}
                    disabled={disabled}
                    className="h-8 px-2 text-sm tabular-nums"
                  />
                </div>
              )}
              {ends === 'after' && (
                <div className="px-1.5 pb-1 pt-1.5">
                  <Input
                    id={countId}
                    aria-label={t`Occurrences`}
                    type="number"
                    min={1}
                    step={1}
                    value={formatRepeatCountInputValue(count)}
                    onChange={(event) => onCountInputChange(event.target.value)}
                    disabled={disabled}
                    className="h-8 px-2 text-sm"
                  />
                </div>
              )}

              {hint && (
                <p className="px-2.5 pb-1.5 pt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
      {error && <div className="text-xs text-destructive">{error}</div>}
      {notice && <div className="text-xs text-emerald-600">{notice}</div>}
    </div>
  );
};
