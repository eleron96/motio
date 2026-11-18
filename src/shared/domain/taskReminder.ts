import { addDays, format, parseISO } from 'date-fns';
import type { Task } from '@/features/planner/types/planner';

/**
 * A task reminder: "tell the assignees N days before the task starts".
 *
 * Tasks have dates but no time of day, so the reminder is counted in whole
 * days and arrives in the morning. The server sends it (migration 0190,
 * `fire_task_reminders`); the hour here must match the one there.
 */
export const TASK_REMINDER_HOUR = 9;

/** The choices the task card offers: on the start day, 1 or 2 days before, a week before. */
export const TASK_REMINDER_DAY_OPTIONS: readonly number[] = [0, 1, 2, 7];

const MAX_REMINDER_DAYS_BEFORE = 30;

/** A stored value → a usable one: a whole number of days within the allowed range, else no reminder. */
export const normalizeReminderDaysBefore = (value: unknown): number | null => (
  typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_REMINDER_DAYS_BEFORE
    ? value
    : null
);

/** The day (YYYY-MM-DD) a reminder is sent on. */
export const getTaskReminderDate = (startDate: string, daysBefore: number): string => (
  format(addDays(parseISO(startDate), -daysBefore), 'yyyy-MM-dd')
);

/**
 * Whether the reminder's moment (09:00 of its day, on this person's clock) is
 * already behind `now` — such a reminder will not be sent.
 */
export const isTaskReminderPast = (startDate: string, daysBefore: number, now: Date): boolean => {
  const moment = addDays(parseISO(startDate), -daysBefore);
  moment.setHours(TASK_REMINDER_HOUR, 0, 0, 0);
  return moment.getTime() <= now.getTime();
};

/**
 * The task fields to write when the reminder changes. The time zone of whoever
 * sets it is stored alongside: assignees whose own zone the server does not
 * know yet are reminded on this clock.
 */
export const buildTaskReminderUpdate = (
  daysBefore: number | null,
  timeZone: string | null,
): Pick<Task, 'reminderDaysBefore' | 'reminderTimeZone'> => (
  daysBefore === null
    ? { reminderDaysBefore: null, reminderTimeZone: null }
    : { reminderDaysBefore: daysBefore, reminderTimeZone: timeZone }
);
