import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, startOfYear } from 'date-fns';
import { isAbortError } from '@/shared/lib/latestAsyncRequest';
import { fetchHolidays } from '@/infrastructure/holidays/holidayApi';
import {
  isEmptyProductionCalendar,
  russianStatutoryHolidays,
} from '@/features/planner/lib/russianHolidays';

const HOLIDAY_RETRY_DELAY_MS = 30000;
const DEFAULT_HOLIDAY_COUNTRY_CODE = 'RU';

export const normalizeHolidayCountryCode = (value: string | null | undefined) => {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : DEFAULT_HOLIDAY_COUNTRY_CODE;
};

type UseHolidayMapParams = {
  years: number[];
  holidayCountryCode: string;
  fallbackHolidayLabel: string;
  holidayLabel: string;
};

export const useHolidayMap = ({
  years,
  holidayCountryCode,
  fallbackHolidayLabel,
  holidayLabel,
}: UseHolidayMapParams) => {
  const loadedHolidayYears = useRef(new Set<number>());
  const loadingHolidayYears = useRef(new Set<number>());
  const [holidayReloadToken, setHolidayReloadToken] = useState(0);
  const [holidayMap, setHolidayMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    loadedHolidayYears.current.clear();
    loadingHolidayYears.current.clear();
    setHolidayMap({});
  }, [holidayCountryCode]);

  useEffect(() => {
    const toLoad = years.filter((year) => (
      !loadedHolidayYears.current.has(year) && !loadingHolidayYears.current.has(year)
    ));
    if (toLoad.length === 0) return;

    let active = true;
    const controller = new AbortController();
    let retryTimer: number | null = null;
    let shouldRetry = false;

    const mergeHolidayEntries = (entries: Record<string, string[]>) => {
      setHolidayMap((prev) => {
        const next = { ...prev };
        Object.entries(entries).forEach(([date, labels]) => {
          const existing = next[date] ?? [];
          labels.forEach((label) => {
            if (!existing.includes(label)) {
              existing.push(label);
            }
          });
          next[date] = existing;
        });
        return next;
      });
    };

    const loadYear = async (year: number) => {
      loadingHolidayYears.current.add(year);
      try {
        const response = await fetchHolidays(holidayCountryCode, year, controller.signal);
        if (!active) return;

        const entries: Record<string, string[]> = {};

        // Production calendar for RU. Weekends are kept, not skipped: the
        // timeline drops them itself (shouldApplyHolidayHatch), while the
        // calendar must show a New Year break as one solid stretch, exactly
        // like the official production calendar does.
        if (holidayCountryCode === 'RU') {
          const raw = response.productionCalendar;
          if (isEmptyProductionCalendar(raw)) {
            // The decree for this year is not out yet (isdayoff.ru answers with
            // all zeros), so fall back to the statutory days from the Labour
            // Code. Better a legally correct minimum than a January that ends
            // on the 7th.
            russianStatutoryHolidays(year).forEach((key) => {
              entries[key] = [fallbackHolidayLabel];
            });
          } else {
            const yearStart = startOfYear(new Date(year, 0, 1));
            for (let index = 0; index < raw!.length; index += 1) {
              if (raw![index] !== '1') continue;
              const key = format(addDays(yearStart, index), 'yyyy-MM-dd');
              entries[key] = [fallbackHolidayLabel];
            }
          }
        }

        // Merge named holidays on top
        response.holidays.forEach((holiday) => {
          if (!holiday.date) return;
          const label = holiday.localName || holiday.name || holidayLabel;
          const existing = entries[holiday.date] ?? [];
          if (!existing.includes(label)) {
            entries[holiday.date] = [...existing, label];
          }
        });

        mergeHolidayEntries(entries);
        loadedHolidayYears.current.add(year);
      } catch (error) {
        if (isAbortError(error)) return;
        console.error(error);
        shouldRetry = true;
      } finally {
        loadingHolidayYears.current.delete(year);
      }
    };

    const loadSequentially = async () => {
      for (const year of toLoad) {
        if (!active) return;
        await loadYear(year);
      }
    };

    void loadSequentially().finally(() => {
      if (!active || !shouldRetry) return;
      retryTimer = window.setTimeout(() => {
        setHolidayReloadToken((prev) => prev + 1);
      }, HOLIDAY_RETRY_DELAY_MS);
    });

    return () => {
      active = false;
      controller.abort();
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [years, holidayCountryCode, holidayReloadToken, fallbackHolidayLabel, holidayLabel]);

  const holidayDates = useMemo(() => new Set(Object.keys(holidayMap)), [holidayMap]);

  return {
    holidayMap,
    holidayDates,
  };
};
