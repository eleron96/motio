import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import {
  buildCalendarMonths,
  CALENDAR_YEARS_BACK,
  CALENDAR_YEARS_FORWARD,
} from '@/features/planner/lib/calendarMonths';

const keys = (months: Date[]) => months.map((month) => format(month, 'yyyy-MM'));

describe('buildCalendarMonths', () => {
  it('renders three whole years: last, current and next', () => {
    const months = buildCalendarMonths('2026-07-26');

    expect(months).toHaveLength((CALENDAR_YEARS_BACK + CALENDAR_YEARS_FORWARD + 1) * 12);
    expect(keys(months)[0]).toBe('2025-01');
    expect(keys(months).at(-1)).toBe('2027-12');
  });

  it('starts every entry at the first day of its month', () => {
    const months = buildCalendarMonths('2026-07-26');

    expect(months.every((month) => month.getDate() === 1)).toBe(true);
  });

  it('has no gaps or repeats', () => {
    const months = keys(buildCalendarMonths('2026-07-26'));

    expect(new Set(months).size).toBe(months.length);
    expect(months.filter((key) => key.endsWith('-01'))).toEqual(['2025-01', '2026-01', '2027-01']);
  });

  // The whole point of snapping to January: a window anchored on the date itself
  // would drift a month at a time and keep half of each end year off screen.
  it('does not move as the date moves inside the year', () => {
    const january = keys(buildCalendarMonths('2026-01-01'));
    const december = keys(buildCalendarMonths('2026-12-31'));

    expect(january).toEqual(december);
  });

  it('shifts by a whole year when the year changes', () => {
    expect(keys(buildCalendarMonths('2027-03-15'))[0]).toBe('2026-01');
    expect(keys(buildCalendarMonths('2027-03-15')).at(-1)).toBe('2028-12');
  });

  it('covers each year in full, twelve cards apiece', () => {
    const byYear = new Map<string, number>();
    keys(buildCalendarMonths('2026-07-26')).forEach((key) => {
      const year = key.slice(0, 4);
      byYear.set(year, (byYear.get(year) ?? 0) + 1);
    });

    expect([...byYear.entries()]).toEqual([['2025', 12], ['2026', 12], ['2027', 12]]);
  });

  it('honours an explicit span', () => {
    const months = keys(buildCalendarMonths('2026-07-26', 0, 0));

    expect(months[0]).toBe('2026-01');
    expect(months.at(-1)).toBe('2026-12');
  });
});
