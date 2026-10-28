import { useEffect, useState } from 'react';
import { fetchHolidays, type HolidayEntry } from '@/infrastructure/holidays/holidayApi';
import { isAbortError } from '@/shared/lib/latestAsyncRequest';
import {
  getHolidayRegionName,
  listHolidayRegions,
  listRegionOnlyHolidayNames,
} from '@/shared/domain/holidayRegion';

export interface HolidayRegionOption {
  code: string;
  name: string;
  /** Holidays the region adds on top of the national ones this year. */
  holidayNames: string[];
}

/**
 * Regions of a country that have holidays of their own, read from this year's
 * calendar. A country without regional holidays yields an empty list, and the
 * settings then show no region picker at all.
 */
export const useHolidayRegionOptions = (countryCode: string, enabled: boolean) => {
  const [options, setOptions] = useState<HolidayRegionOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOptions([]);
    if (!enabled || !/^[A-Z]{2}$/.test(countryCode)) return;

    let active = true;
    const controller = new AbortController();
    setLoading(true);

    fetchHolidays(countryCode, new Date().getFullYear(), controller.signal)
      .then((response) => {
        if (!active) return;
        const holidays: HolidayEntry[] = response.holidays ?? [];
        setOptions(listHolidayRegions(holidays).map((code) => ({
          code,
          name: getHolidayRegionName(code),
          holidayNames: listRegionOnlyHolidayNames(holidays, code),
        })));
      })
      .catch((error) => {
        if (!isAbortError(error)) console.error(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [countryCode, enabled]);

  return { options, loading };
};
