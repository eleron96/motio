import { describe, expect, it } from 'vitest';
import { normalizeHolidayCountryCode } from '@/features/planner/hooks/useHolidayMap';

describe('useHolidayMap', () => {
  it('normalizes invalid holiday country code to RU', () => {
    expect(normalizeHolidayCountryCode('')).toBe('RU');
    expect(normalizeHolidayCountryCode('  usa')).toBe('RU');
    expect(normalizeHolidayCountryCode('us')).toBe('US');
    expect(normalizeHolidayCountryCode('Ru')).toBe('RU');
  });
});
