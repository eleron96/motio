import { getISOWeek } from 'date-fns';

// Calendar week numbers in the timeline header are a per-user profile
// preference, off unless the person turns them on in account settings →
// Appearance. The storage key and the read logic live here so the toggle and
// the header agree.
export const WEEK_NUMBERS_PREFERENCE_KEY = 'week_numbers_enabled';

export const isWeekNumbersEnabled = (
  preferences: Record<string, unknown> | null | undefined,
): boolean => preferences?.[WEEK_NUMBERS_PREFERENCE_KEY] === true;

/**
 * The ISO 8601 week number to print over a day column, or null for a day that
 * carries no label. A week is labelled once, on its Monday — the timeline's
 * weeks start on Monday everywhere, and ISO weeks do too, so the number over a
 * Monday holds for the six days after it.
 */
export const weekNumberForColumn = (day: Date): number | null => (
  day.getDay() === 1 ? getISOWeek(day) : null
);
