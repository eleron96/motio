import { describe, expect, it } from 'vitest';
import { shouldApplyHolidayHatch } from '@/features/planner/lib/dateUtils';

describe('shouldApplyHolidayHatch', () => {
  it('applies hatch for holiday on weekday', () => {
    const holidayDates = new Set(['2026-02-25']);

    expect(shouldApplyHolidayHatch('2026-02-25', false, holidayDates)).toBe(true);
  });

  it('skips hatch for holiday on weekend', () => {
    const holidayDates = new Set(['2026-02-22']);

    expect(shouldApplyHolidayHatch('2026-02-22', true, holidayDates)).toBe(false);
  });

  it('skips hatch for non-holiday day', () => {
    const holidayDates = new Set(['2026-02-25']);

    expect(shouldApplyHolidayHatch('2026-02-26', false, holidayDates)).toBe(false);
  });
});
