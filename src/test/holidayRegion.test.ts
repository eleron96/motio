import { describe, expect, it } from 'vitest';
import {
  getHolidayRegionName,
  isHolidayObservedInRegion,
  listHolidayRegions,
  listRegionOnlyHolidayNames,
  normalizeHolidayRegionCode,
} from '@/shared/domain/holidayRegion';

// A slice of Germany's 2026 holidays as the holiday source returns them.
const germany2026 = [
  { date: '2026-01-01', localName: 'Neujahr', name: "New Year's Day", global: true, counties: null },
  { date: '2026-01-06', localName: 'Heilige Drei Könige', name: 'Epiphany', global: false, counties: ['DE-BW', 'DE-BY', 'DE-ST'] },
  { date: '2026-03-08', localName: 'Internationaler Frauentag', name: "International Women's Day", global: false, counties: ['DE-BE', 'DE-MV'] },
  { date: '2026-06-04', localName: 'Fronleichnam', name: 'Corpus Christi', global: false, counties: ['DE-BW', 'DE-BY', 'DE-HE', 'DE-NW'] },
  { date: '2026-10-03', localName: 'Tag der Deutschen Einheit', name: 'German Unity Day', global: true, counties: null },
];

describe('isHolidayObservedInRegion', () => {
  it('keeps only national holidays when no region is chosen', () => {
    const observed = germany2026.filter((holiday) => isHolidayObservedInRegion(holiday, null));

    expect(observed.map((holiday) => holiday.date)).toEqual(['2026-01-01', '2026-10-03']);
  });

  it('adds the holidays of the chosen region', () => {
    const observed = germany2026.filter((holiday) => isHolidayObservedInRegion(holiday, 'DE-BY'));

    expect(observed.map((holiday) => holiday.date)).toEqual([
      '2026-01-01',
      '2026-01-06',
      '2026-06-04',
      '2026-10-03',
    ]);
  });

  it('treats a holiday without the flag as national', () => {
    expect(isHolidayObservedInRegion({}, null)).toBe(true);
    expect(isHolidayObservedInRegion({ global: null, counties: null }, null)).toBe(true);
  });
});

describe('normalizeHolidayRegionCode', () => {
  it('accepts a region of the same country', () => {
    expect(normalizeHolidayRegionCode(' de-by ', 'DE')).toBe('DE-BY');
    expect(normalizeHolidayRegionCode('AU-NSW', 'au')).toBe('AU-NSW');
    expect(normalizeHolidayRegionCode('AT-9', 'AT')).toBe('AT-9');
  });

  it('drops a region of another country or a malformed code', () => {
    expect(normalizeHolidayRegionCode('DE-BY', 'AT')).toBeNull();
    expect(normalizeHolidayRegionCode('Bayern', 'DE')).toBeNull();
    expect(normalizeHolidayRegionCode('', 'DE')).toBeNull();
    expect(normalizeHolidayRegionCode(null, 'DE')).toBeNull();
  });
});

describe('region options', () => {
  it('lists the regions that have holidays of their own, by name', () => {
    expect(listHolidayRegions(germany2026)).toEqual([
      'DE-BW', // Baden-Württemberg
      'DE-BY', // Bayern
      'DE-BE', // Berlin
      'DE-HE', // Hessen
      'DE-MV', // Mecklenburg-Vorpommern
      'DE-NW', // Nordrhein-Westfalen
      'DE-ST', // Sachsen-Anhalt
    ]);
  });

  it('names the holidays a region adds', () => {
    expect(listRegionOnlyHolidayNames(germany2026, 'DE-BY')).toEqual(['Heilige Drei Könige', 'Fronleichnam']);
    expect(listRegionOnlyHolidayNames(germany2026, 'DE-HH')).toEqual([]);
  });

  it('falls back to the code where no name is known', () => {
    expect(getHolidayRegionName('DE-BY')).toBe('Bayern');
    expect(getHolidayRegionName('AT-9')).toBe('Wien');
    expect(getHolidayRegionName('US-CA')).toBe('US-CA');
  });
});
