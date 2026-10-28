import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHolidayMap } from '@/features/planner/hooks/useHolidayMap';

const fetchHolidays = vi.hoisted(() => vi.fn());

vi.mock('@/infrastructure/holidays/holidayApi', () => ({ fetchHolidays }));

fetchHolidays.mockResolvedValue({
  productionCalendar: null,
  holidays: [
    { date: '2026-01-01', localName: 'Neujahr', name: "New Year's Day", global: true, counties: null },
    { date: '2026-06-04', localName: 'Fronleichnam', name: 'Corpus Christi', global: false, counties: ['DE-BY', 'DE-NW'] },
    { date: '2026-10-31', localName: 'Reformationstag', name: 'Reformation Day', global: false, counties: ['DE-SN'] },
  ],
});

// Callers memoize the year list; a fresh array on every render would restart the load.
const YEARS = [2026];

const renderHolidayMap = (holidayRegionCode: string | null) => renderHook(() => useHolidayMap({
  years: YEARS,
  holidayCountryCode: 'DE',
  holidayRegionCode,
  fallbackHolidayLabel: 'Non-working day',
  holidayLabel: 'Holiday',
}));

describe('useHolidayMap regions', () => {
  it('shows only national holidays without a region', async () => {
    const { result } = renderHolidayMap(null);

    await waitFor(() => expect(result.current.holidayDates.size).toBe(1));
    expect(result.current.holidayMap).toEqual({ '2026-01-01': ['Neujahr'] });
  });

  it('adds the holidays of the workspace region', async () => {
    const { result } = renderHolidayMap('DE-BY');

    await waitFor(() => expect(result.current.holidayDates.size).toBe(2));
    expect(result.current.holidayDates.has('2026-06-04')).toBe(true);
    expect(result.current.holidayDates.has('2026-10-31')).toBe(false);
  });
});
