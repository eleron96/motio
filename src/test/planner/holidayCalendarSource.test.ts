import { describe, expect, it } from 'vitest';
import { addDays, format, isWeekend, startOfYear } from 'date-fns';
import { isEmptyProductionCalendar, russianStatutoryHolidays } from '@/features/planner/lib/russianHolidays';

// Mirrors the branch in useHolidayMap: the production-calendar payload marks
// EVERY non-working day, weekends included, so ordinary Saturdays and Sundays
// must be dropped there — otherwise half the calendar reads as a holiday.
// Days that are holidays in their own right come from the named list and from
// the statutory fallback, and those are NOT filtered.
const daysFromProductionCalendar = (year: number, raw: string): string[] => {
  const yearStart = startOfYear(new Date(year, 0, 1));
  const days: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== '1') continue;
    const day = addDays(yearStart, index);
    if (isWeekend(day)) continue;
    days.push(format(day, 'yyyy-MM-dd'));
  }
  return days;
};

describe('holiday sources', () => {
  it('does not turn ordinary weekends into holidays', () => {
    // Every day of 2026 marked non-working, the way isdayoff marks weekends too.
    const everything = '1'.repeat(365);

    const days = daysFromProductionCalendar(2026, everything);

    expect(days).not.toContain('2026-01-10'); // Saturday
    expect(days).not.toContain('2026-01-11'); // Sunday
    expect(days).toContain('2026-01-09'); // Friday — a real transferred day off
  });

  it('keeps the transferred working days that are the point of the calendar', () => {
    // 2027-05-03 (Monday) and 2027-05-10 (Monday) are days off transferred from
    // the weekend holidays.
    const raw = Array.from({ length: 365 }, (_, index) => {
      const day = addDays(startOfYear(new Date(2027, 0, 1)), index);
      const key = format(day, 'yyyy-MM-dd');
      return key === '2027-05-03' || key === '2027-05-10' ? '1' : '0';
    }).join('');

    expect(daysFromProductionCalendar(2027, raw)).toEqual(['2027-05-03', '2027-05-10']);
  });

  it('the statutory fallback still carries holidays that land on a weekend', () => {
    // 2027-01-02 is a Saturday and 2027-01-03 a Sunday, but they are holidays,
    // not ordinary weekends — the fallback must keep them.
    const days = russianStatutoryHolidays(2027);

    expect(days).toContain('2027-01-02');
    expect(days).toContain('2027-01-03');
  });

  it('recognises the empty payload that means "year not published yet"', () => {
    expect(isEmptyProductionCalendar('0'.repeat(365))).toBe(true);
  });
});
