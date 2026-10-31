import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  fetchHolidays,
  readCachedHolidays,
  resetHolidayCacheForTests,
} from '@/infrastructure/holidays/holidayApi';
import { useHolidayMap } from '@/features/planner/hooks/useHolidayMap';

/**
 * Holidays are asked once per page session and saved for the next visit, so
 * the timeline paints days off with its first frame.
 */

const answer = {
  productionCalendar: null,
  holidays: [{ date: '2026-01-01', localName: 'Neujahr', name: "New Year's Day", global: true, counties: null }],
};

const fetchMock = vi.fn();
const YEARS = [2026];

beforeEach(() => {
  resetHolidayCacheForTests();
  window.localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(answer) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('holiday cache', () => {
  it('asks the server once per country and year in a session', async () => {
    await Promise.all([fetchHolidays('DE', 2026), fetchHolidays('DE', 2026)]);
    await fetchHolidays('DE', 2026);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readCachedHolidays('DE', 2026)).toEqual(answer);
  });

  it('keeps the answer for the next visit', async () => {
    await fetchHolidays('DE', 2026);
    resetHolidayCacheForTests();

    expect(readCachedHolidays('DE', 2026)).toEqual(answer);
    expect(readCachedHolidays('DE', 2027)).toBeNull();
  });

  it('tries again after a failed request', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: () => Promise.resolve(null) });
    await expect(fetchHolidays('DE', 2026)).rejects.toThrow('502');

    await expect(fetchHolidays('DE', 2026)).resolves.toEqual(answer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('paints the saved days off on the first render, before any answer', () => {
    window.localStorage.setItem('motio.holidays.v1:DE:2026', JSON.stringify(answer));
    fetchMock.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useHolidayMap({
      years: YEARS,
      holidayCountryCode: 'DE',
      holidayRegionCode: null,
      fallbackHolidayLabel: 'Non-working day',
      holidayLabel: 'Holiday',
    }));

    expect(result.current.holidayMap).toEqual({ '2026-01-01': ['Neujahr'] });
  });

  it('ignores a damaged saved copy', () => {
    window.localStorage.setItem('motio.holidays.v1:DE:2026', '{"holidays":5}');
    expect(readCachedHolidays('DE', 2026)).toBeNull();
  });
});
