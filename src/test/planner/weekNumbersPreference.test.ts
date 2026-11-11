import { describe, expect, it } from 'vitest';
import {
  isWeekNumbersEnabled,
  WEEK_NUMBERS_PREFERENCE_KEY,
  weekNumberForColumn,
} from '@/features/planner/lib/weekNumbersPreference';

describe('weekNumbersPreference', () => {
  it('uses a stable storage key', () => {
    expect(WEEK_NUMBERS_PREFERENCE_KEY).toBe('week_numbers_enabled');
  });

  it('is on only for an explicit true', () => {
    expect(isWeekNumbersEnabled({ week_numbers_enabled: true })).toBe(true);
    expect(isWeekNumbersEnabled({ week_numbers_enabled: false })).toBe(false);
    expect(isWeekNumbersEnabled({ week_numbers_enabled: 'true' })).toBe(false);
    expect(isWeekNumbersEnabled({})).toBe(false);
    expect(isWeekNumbersEnabled(null)).toBe(false);
    expect(isWeekNumbersEnabled(undefined)).toBe(false);
  });
});

describe('weekNumberForColumn', () => {
  const day = (year: number, month: number, date: number) => new Date(year, month - 1, date);

  it('labels a week once, on its Monday', () => {
    expect(weekNumberForColumn(day(2026, 11, 9))).toBe(46);
    for (let date = 10; date <= 15; date += 1) {
      expect(weekNumberForColumn(day(2026, 11, date))).toBeNull();
    }
    expect(weekNumberForColumn(day(2026, 11, 16))).toBe(47);
  });

  it('numbers weeks the ISO way across the turn of the year', () => {
    // 2026 has 53 ISO weeks: its last Monday is week 53, the next one is week 1.
    expect(weekNumberForColumn(day(2026, 12, 28))).toBe(53);
    expect(weekNumberForColumn(day(2027, 1, 4))).toBe(1);
    // Monday 29 December 2025 already belongs to week 1 of 2026.
    expect(weekNumberForColumn(day(2025, 12, 29))).toBe(1);
  });
});
