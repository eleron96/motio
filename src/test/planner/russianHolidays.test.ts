import { describe, expect, it } from 'vitest';
import {
  isEmptyProductionCalendar,
  russianStatutoryHolidays,
} from '@/features/planner/lib/russianHolidays';

describe('isEmptyProductionCalendar', () => {
  it('treats an all-zero payload as "no data"', () => {
    // isdayoff.ru answers like this for a year whose decree is not signed yet
    // (verified for 2027) — reading it literally would mean "nobody rests".
    expect(isEmptyProductionCalendar('0'.repeat(365))).toBe(true);
    expect(isEmptyProductionCalendar('')).toBe(true);
    expect(isEmptyProductionCalendar(null)).toBe(true);
  });

  it('accepts a real calendar', () => {
    expect(isEmptyProductionCalendar(`11111111111${'0'.repeat(354)}`)).toBe(false);
  });
});

describe('russianStatutoryHolidays', () => {
  it('covers the whole New Year break, the 8th included', () => {
    const days = russianStatutoryHolidays(2027);

    ['2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04',
      '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'].forEach((day) => {
      expect(days).toContain(day);
    });
  });

  it('lists every statutory holiday', () => {
    const days = russianStatutoryHolidays(2027);

    ['2027-02-23', '2027-03-08', '2027-05-01', '2027-05-09', '2027-06-12', '2027-11-04']
      .forEach((day) => expect(days).toContain(day));
  });

  it('moves a holiday that lands on a weekend to the next working day', () => {
    // 2027-05-01 is a Saturday and 2027-05-09 a Sunday.
    const days = russianStatutoryHolidays(2027);

    expect(days).toContain('2027-05-03'); // rolled from Saturday the 1st
    expect(days).toContain('2027-05-10'); // rolled from Sunday the 9th
  });

  it('does not invent January transfers', () => {
    // The New Year decree moves days anywhere in the year; guessing would be
    // worse than staying with the legal minimum.
    const days = russianStatutoryHolidays(2027).filter((day) => !day.startsWith('2027-01'));

    expect(days).not.toContain('2027-01-09');
    expect(days.length).toBeLessThanOrEqual(10);
  });

  it('returns sorted, unique days', () => {
    const days = russianStatutoryHolidays(2026);

    expect([...new Set(days)]).toEqual(days);
    expect([...days].sort()).toEqual(days);
  });
});
