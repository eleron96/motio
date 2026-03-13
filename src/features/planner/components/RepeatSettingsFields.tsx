import React from 'react';
import { t } from '@lingui/macro';

import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { formatRepeatCountInputValue, RepeatEnds, RepeatFrequency } from '@/features/planner/lib/taskFormRules';

type RepeatSettingsFieldsProps = {
  compact?: boolean;
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

export const RepeatSettingsFields = ({
  compact = false,
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
}: RepeatSettingsFieldsProps) => {
  const fieldSpacingClassName = compact ? 'space-y-1' : 'space-y-1.5';
  const gridGapClassName = compact ? 'gap-2' : 'gap-3';
  const helperTextClassName = 'text-[11px] text-muted-foreground';
  const triggerClassName = compact ? 'h-8 text-sm' : undefined;
  const inputClassName = compact ? 'h-8 text-sm' : undefined;
  const labelClassName = compact ? 'text-xs text-muted-foreground' : undefined;
  const untilId = `${idPrefix}-repeat-until`;
  const countId = `${idPrefix}-repeat-count`;

  return (
    <>
      <div className={`grid grid-cols-2 ${gridGapClassName}`}>
        <div className={fieldSpacingClassName}>
          <Select
            value={frequency}
            onValueChange={(value) => onFrequencyChange(value as RepeatFrequency)}
            disabled={disabled}
          >
            <SelectTrigger className={triggerClassName}>
              <SelectValue placeholder={t`Repeat`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t`Does not repeat`}</SelectItem>
              <SelectItem value="daily">{t`Daily`}</SelectItem>
              <SelectItem value="weekly">{t`Weekly`}</SelectItem>
              <SelectItem value="biweekly">{t`Biweekly (every 2 weeks)`}</SelectItem>
              <SelectItem value="monthly">{t`Monthly`}</SelectItem>
              <SelectItem value="yearly">{t`Yearly`}</SelectItem>
            </SelectContent>
          </Select>
          <p className={helperTextClassName}>{t`Repeat type`}</p>
        </div>

        <div className={fieldSpacingClassName}>
          <Select
            value={ends}
            onValueChange={(value) => onEndsChange(value as RepeatEnds)}
            disabled={disabled || frequency === 'none'}
          >
            <SelectTrigger className={triggerClassName}>
              <SelectValue placeholder={t`Ends`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">{t`Never`}</SelectItem>
              <SelectItem value="on">{t`Until date`}</SelectItem>
              <SelectItem value="after">{t`Count`}</SelectItem>
            </SelectContent>
          </Select>
          <p className={helperTextClassName}>{t`Repeat limit`}</p>
        </div>
      </div>

      {frequency !== 'none' && ends === 'on' && (
        <div className={fieldSpacingClassName}>
          <Label htmlFor={untilId} className={labelClassName}>{t`End date`}</Label>
          <Input
            id={untilId}
            type="date"
            value={until}
            onChange={(event) => onUntilChange(event.target.value)}
            disabled={disabled}
            className={inputClassName}
          />
          <p className={helperTextClassName}>{t`Repeats until the selected date.`}</p>
        </div>
      )}

      {frequency !== 'none' && ends === 'after' && (
        <div className={fieldSpacingClassName}>
          <Label htmlFor={countId} className={labelClassName}>{t`Occurrences`}</Label>
          <Input
            id={countId}
            type="number"
            min={1}
            step={1}
            value={formatRepeatCountInputValue(count)}
            onChange={(event) => onCountInputChange(event.target.value)}
            disabled={disabled}
            className={inputClassName}
          />
          <p className={helperTextClassName}>{t`Creates the specified number of repeats.`}</p>
        </div>
      )}

      {showNeverHint && frequency !== 'none' && ends === 'never' && (
        <p className={helperTextClassName}>{t`Creates repeats for the next 12 months.`}</p>
      )}

      {error && (
        <div className="text-xs text-destructive">{error}</div>
      )}

      {notice && (
        <div className="text-xs text-emerald-600">{notice}</div>
      )}
    </>
  );
};
