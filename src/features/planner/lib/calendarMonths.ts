// Which months the calendar view renders.
//
// Deliberately a sliding window around the current date rather than the span of
// the task list: the old rule (earliest task -1 year … latest task +5 years)
// produced 84-108 month cards and ~3900 day cells. That is slow to render, and
// it is also dishonest — milestones and time off are loaded around the current
// date, so the far-out months showed empty days that read as "nothing here"
// instead of "not loaded".

import { addMonths, parseISO, startOfMonth } from 'date-fns';

/** Twelve months back and twelve forward — two years on screen at a time. */
export const CALENDAR_MONTHS_BACK = 12;
export const CALENDAR_MONTHS_FORWARD = 12;

export const buildCalendarMonths = (
  currentDate: string,
  monthsBack: number = CALENDAR_MONTHS_BACK,
  monthsForward: number = CALENDAR_MONTHS_FORWARD,
): Date[] => {
  const baseDate = parseISO(currentDate);
  const rangeEnd = startOfMonth(addMonths(baseDate, monthsForward));
  const months: Date[] = [];
  let cursor = startOfMonth(addMonths(baseDate, -monthsBack));
  while (cursor <= rangeEnd) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
};
