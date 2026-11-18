import React from 'react';
import { plural, t } from '@lingui/macro';
import { Label } from '@/shared/ui/label';
import { ResponsiveSelect } from '@/shared/ui/responsive-select';
import { formatDayAndMonth } from '@/shared/lib/dateFnsLocale';
import { useLocaleStore } from '@/shared/store/localeStore';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import {
  TASK_REMINDER_DAY_OPTIONS,
  getTaskReminderDate,
  isTaskReminderPast,
} from '@/shared/domain/taskReminder';

interface TaskReminderFieldProps {
  /** Days before the start, or null for no reminder. */
  value: number | null;
  onChange: (daysBefore: number | null) => void;
  /** The task's first day (YYYY-MM-DD): the reminder is counted from it. */
  startDate: string;
  assigneeCount: number;
  disabled?: boolean;
  idPrefix: string;
}

const NO_REMINDER = 'none';

const reminderOptionLabel = (daysBefore: number) => {
  if (daysBefore === 0) return t`On the start day`;
  if (daysBefore === 7) return t`1 week before`;
  return plural(daysBefore, { one: '# day before', other: '# days before' });
};

/** "Remind the assignees N days before the task starts" — one field of the task parameters. */
export const TaskReminderField: React.FC<TaskReminderFieldProps> = ({
  value,
  onChange,
  startDate,
  assigneeCount,
  disabled = false,
  idPrefix,
}) => {
  const locale = useLocaleStore((state) => state.locale);
  // Re-render at midnight: which options are already in the past depends on today.
  useTodayKey();
  const now = new Date();

  const dayOptions = value === null || TASK_REMINDER_DAY_OPTIONS.includes(value)
    ? TASK_REMINDER_DAY_OPTIONS
    : [...TASK_REMINDER_DAY_OPTIONS, value].sort((left, right) => left - right);

  const options = [
    { value: NO_REMINDER, label: t`No reminder` },
    ...dayOptions.map((daysBefore) => ({
      value: String(daysBefore),
      label: reminderOptionLabel(daysBefore),
      // A moment that has passed cannot be picked; the current choice stays selectable.
      disabled: daysBefore !== value && isTaskReminderPast(startDate, daysBefore, now),
    })),
  ];

  const hint = (() => {
    if (value === null) return null;
    if (isTaskReminderPast(startDate, value, now)) {
      return t`This time has already passed, so no reminder will be sent.`;
    }
    if (assigneeCount === 0) {
      return t`Add an assignee: the reminder goes to the people on the task.`;
    }
    const dateLabel = formatDayAndMonth(getTaskReminderDate(startDate, value), locale);
    return t`Assignees get a notification on ${dateLabel} at 9:00 AM.`;
  })();

  const triggerId = `${idPrefix}-reminder`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={triggerId}>{t`Reminder`}</Label>
      <ResponsiveSelect
        value={value === null ? NO_REMINDER : String(value)}
        onValueChange={(next) => onChange(next === NO_REMINDER ? null : Number(next))}
        disabled={disabled}
        triggerId={triggerId}
        title={t`Reminder`}
        placeholder={t`No reminder`}
        triggerClassName="bg-background text-left"
        valueClassName="truncate text-left"
        options={options}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
};
