import React from 'react';
import { Check } from 'lucide-react';
import { t } from '@lingui/macro';
import { formatRepeatCountInputValue, RepeatEnds, RepeatFrequency } from '@/features/planner/lib/taskFormRules';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { Label } from '@/shared/ui/label';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';

interface MobileRepeatScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  disabled?: boolean;
  ends: RepeatEnds;
  frequency: RepeatFrequency;
  idPrefix: string;
  frequencyOptions: Array<{ value: RepeatFrequency; label: string }>;
  endsOptions: Array<{ value: RepeatEnds; label: string }>;
  hint?: string;
  onCountInputChange: (value: string) => void;
  onEndsChange: (value: RepeatEnds) => void;
  onFrequencyChange: (value: RepeatFrequency) => void;
  onUntilChange: (value: string) => void;
  until: string;
}

const SelectedMark: React.FC<{ selected: boolean }> = ({ selected }) => (
  selected ? <Check aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-foreground" /> : null
);

/**
 * Repeat settings on a phone, as a screen rather than a popover.
 *
 * The popover is a 288px card floating over the form: its option lists are
 * pointer-sized, and the moment the end-date or count field opens the keyboard
 * the card is pushed somewhere the finger cannot follow. Full screen, the
 * lists are ordinary rows and the fields keep their room.
 */
export const MobileRepeatScreen: React.FC<MobileRepeatScreenProps> = ({
  open,
  onOpenChange,
  count,
  disabled = false,
  ends,
  frequency,
  idPrefix,
  frequencyOptions,
  endsOptions,
  hint,
  onCountInputChange,
  onEndsChange,
  onFrequencyChange,
  onUntilChange,
  until,
}) => {
  const isOff = frequency === 'none';
  const switchId = `${idPrefix}-repeat-switch-mobile`;
  const untilId = `${idPrefix}-repeat-until-mobile`;
  const countId = `${idPrefix}-repeat-count-mobile`;

  return (
    <MobileScreenShell
      open={open}
      onOpenChange={onOpenChange}
      title={t`Repeat`}
      contentClassName="space-y-5"
    >
      <MobileListGroup>
        <MobileListRow
          title={<label htmlFor={switchId}>{t`Repeat task`}</label>}
          right={(
            <Switch
              id={switchId}
              size="touch"
              checked={!isOff}
              disabled={disabled}
              onCheckedChange={(checked) => onFrequencyChange(checked ? 'daily' : 'none')}
            />
          )}
        />
      </MobileListGroup>

      {!isOff && (
        <>
          <MobileListGroup title={t`Repeat type`}>
            {frequencyOptions.map((option) => (
              <MobileListRow
                key={option.value}
                title={option.label}
                disabled={disabled}
                selected={option.value === frequency}
                onClick={() => onFrequencyChange(option.value)}
                right={<SelectedMark selected={option.value === frequency} />}
              />
            ))}
          </MobileListGroup>

          <MobileListGroup title={t`Repeat limit`} note={hint || undefined}>
            {endsOptions.map((option) => (
              <MobileListRow
                key={option.value}
                title={option.label}
                disabled={disabled}
                selected={option.value === ends}
                onClick={() => onEndsChange(option.value)}
                right={<SelectedMark selected={option.value === ends} />}
              />
            ))}
          </MobileListGroup>

          {ends === 'on' && (
            <div className="space-y-1.5">
              <Label htmlFor={untilId}>{t`End date`}</Label>
              <Input
                id={untilId}
                type="date"
                value={until}
                disabled={disabled}
                onChange={(event) => onUntilChange(event.target.value)}
                className="h-11 tabular-nums"
              />
            </div>
          )}

          {ends === 'after' && (
            <div className="space-y-1.5">
              <Label htmlFor={countId}>{t`Occurrences`}</Label>
              <Input
                id={countId}
                type="number"
                min={1}
                step={1}
                value={formatRepeatCountInputValue(count)}
                disabled={disabled}
                onChange={(event) => onCountInputChange(event.target.value)}
                className="h-11"
              />
            </div>
          )}
        </>
      )}
    </MobileScreenShell>
  );
};
