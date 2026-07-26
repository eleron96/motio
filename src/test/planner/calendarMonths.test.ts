import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import {
  buildCalendarMonths,
  CALENDAR_MONTHS_BACK,
  CALENDAR_MONTHS_FORWARD,
} from '@/features/planner/lib/calendarMonths';

const keys = (months: Date[]) => months.map((month) => format(month, 'yyyy-MM'));

describe('buildCalendarMonths', () => {
  it('renders two years around the current date', () => {
    const months = buildCalendarMonths('2026-07-26');

    expect(months).toHaveLength(CALENDAR_MONTHS_BACK + CALENDAR_MONTHS_FORWARD + 1);
    expect(keys(months)[0]).toBe('2025-07');
    expect(keys(months).at(-1)).toBe('2027-07');
  });

  it('starts every entry at the first day of its month', () => {
    const months = buildCalendarMonths('2026-07-26');

    expect(months.every((month) => month.getDate() === 1)).toBe(true);
  });

  it('has no gaps or repeats across a year boundary', () => {
    const months = keys(buildCalendarMonths('2026-01-15', 2, 2));

    expect(months).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
  });

  it('moves with the current date', () => {
    const july = keys(buildCalendarMonths('2026-07-01', 1, 1));
    const august = keys(buildCalendarMonths('2026-08-01', 1, 1));

    expect(july).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(august).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('handles the last day of a long month without skipping', () => {
    // A naive addMonths on the 31st can land on the 30th/28th and drop a month.
    expect(keys(buildCalendarMonths('2026-01-31', 1, 1))).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(keys(buildCalendarMonths('2026-03-31', 1, 1))).toEqual(['2026-02', '2026-03', '2026-04']);
  });
});
