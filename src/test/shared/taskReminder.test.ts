import { describe, expect, it } from 'vitest';
import {
  TASK_REMINDER_DAY_OPTIONS,
  buildTaskReminderUpdate,
  getTaskReminderDate,
  isTaskReminderPast,
  normalizeReminderDaysBefore,
} from '@/shared/domain/taskReminder';
import { mapTaskRow } from '@/shared/domain/taskRowMapper';
import { mapTaskUpdates } from '@/features/planner/store/plannerStore.helpers';

describe('task reminder', () => {
  it('offers the start day, one and two days before, and a week before', () => {
    expect(TASK_REMINDER_DAY_OPTIONS).toEqual([0, 1, 2, 7]);
  });

  it('counts the reminder day back from the first day of the task', () => {
    expect(getTaskReminderDate('2026-11-25', 0)).toBe('2026-11-25');
    expect(getTaskReminderDate('2026-11-25', 1)).toBe('2026-11-24');
    expect(getTaskReminderDate('2026-12-03', 7)).toBe('2026-11-26');
    // Across a month and a year boundary.
    expect(getTaskReminderDate('2027-01-01', 2)).toBe('2026-12-30');
  });

  it('is past once 9:00 of the reminder day has come', () => {
    const at = (hours: number, minutes: number) => new Date(2026, 10, 24, hours, minutes);
    // Reminder day is 24 November (one day before the 25th).
    expect(isTaskReminderPast('2026-11-25', 1, at(8, 59))).toBe(false);
    expect(isTaskReminderPast('2026-11-25', 1, at(9, 0))).toBe(true);
    expect(isTaskReminderPast('2026-11-25', 1, at(15, 0))).toBe(true);
    // The same morning is still ahead of a reminder on the start day itself.
    expect(isTaskReminderPast('2026-11-25', 0, at(15, 0))).toBe(false);
    // A week before was long ago.
    expect(isTaskReminderPast('2026-11-25', 7, at(8, 0))).toBe(true);
  });

  it('reads anything but a whole number of days from 0 to 30 as no reminder', () => {
    expect(normalizeReminderDaysBefore(0)).toBe(0);
    expect(normalizeReminderDaysBefore(7)).toBe(7);
    expect(normalizeReminderDaysBefore(30)).toBe(30);
    expect(normalizeReminderDaysBefore(31)).toBeNull();
    expect(normalizeReminderDaysBefore(-1)).toBeNull();
    expect(normalizeReminderDaysBefore(1.5)).toBeNull();
    expect(normalizeReminderDaysBefore('1')).toBeNull();
    expect(normalizeReminderDaysBefore(null)).toBeNull();
    expect(normalizeReminderDaysBefore(undefined)).toBeNull();
  });

  it('stores the time zone together with the reminder and clears both together', () => {
    expect(buildTaskReminderUpdate(1, 'Europe/Berlin')).toEqual({
      reminderDaysBefore: 1,
      reminderTimeZone: 'Europe/Berlin',
    });
    expect(buildTaskReminderUpdate(0, null)).toEqual({ reminderDaysBefore: 0, reminderTimeZone: null });
    expect(buildTaskReminderUpdate(null, 'Europe/Berlin')).toEqual({
      reminderDaysBefore: null,
      reminderTimeZone: null,
    });
  });
});

describe('task reminder in the task row', () => {
  const row = {
    id: 'task-1',
    title: 'Site visit',
    project_id: null,
    assignee_id: null,
    assignee_ids: ['a1'],
    start_date: '2026-11-25',
    end_date: '2026-11-25',
    status_id: 'status-1',
    type_id: 'type-1',
    priority: null,
    tag_ids: [],
    description: null,
    repeat_id: null,
  };

  it('maps the reminder columns of a row', () => {
    const mapped = mapTaskRow({ ...row, reminder_days_before: 2, reminder_time_zone: 'Asia/Novosibirsk' });
    expect(mapped.reminderDaysBefore).toBe(2);
    expect(mapped.reminderTimeZone).toBe('Asia/Novosibirsk');
  });

  it('reads a row without the columns, or with a broken value, as no reminder', () => {
    expect(mapTaskRow(row).reminderDaysBefore).toBeNull();
    expect(mapTaskRow(row).reminderTimeZone).toBeNull();
    expect(mapTaskRow({ ...row, reminder_days_before: 99 }).reminderDaysBefore).toBeNull();
  });

  it('writes the reminder columns only when the update names them', () => {
    expect(mapTaskUpdates({ title: 'Renamed' })).toEqual({ title: 'Renamed' });
    expect(mapTaskUpdates(buildTaskReminderUpdate(1, 'Europe/Berlin'))).toEqual({
      reminder_days_before: 1,
      reminder_time_zone: 'Europe/Berlin',
    });
    expect(mapTaskUpdates(buildTaskReminderUpdate(null, 'Europe/Berlin'))).toEqual({
      reminder_days_before: null,
      reminder_time_zone: null,
    });
  });
});
