import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, isWeekend, startOfYear } from 'date-fns';
import { isAbortError } from '@/shared/lib/latestAsyncRequest';

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

    const loadNagerYear = async (year: number) => {
      const response = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/${holidayCountryCode}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`Holiday fetch failed: ${response.status}`);
      }
      const entries: Record<string, string[]> = {};
      const data = (await response.json()) as Array<{ date?: string; localName?: string; name?: string }>;
      data.forEach((holiday) => {
        if (!holiday.date) return;
        const label = holiday.localName || holiday.name || holidayLabel;
        const existing = entries[holiday.date] ?? [];
        if (existing.includes(label)) return;
        entries[holiday.date] = [...existing, label];
      });
      return entries;
    };

    const loadRuProductionCalendarYear = async (year: number) => {
      const response = await fetch(
        `https://isdayoff.ru/api/getdata?year=${year}&cc=ru`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`Holiday production calendar fetch failed: ${response.status}`);
      }
      const raw = (await response.text()).trim();
      if (!raw || !/^[0-9]+$/.test(raw)) {
        throw new Error('Holiday production calendar returned invalid payload');
      }

      const yearStart = startOfYear(new Date(year, 0, 1));
      const entries: Record<string, string[]> = {};
      for (let index = 0; index < raw.length; index += 1) {
        const code = raw[index];
        if (code !== '1') continue;
        const day = addDays(yearStart, index);
        // Weekend cells are already styled separately in timeline; this marks weekday non-working days.
        if (isWeekend(day)) continue;
        const key = format(day, 'yyyy-MM-dd');
        entries[key] = [fallbackHolidayLabel];
      }
      return entries;
    };

    const loadYear = async (year: number) => {
      loadingHolidayYears.current.add(year);
      try {
        if (holidayCountryCode === 'RU') {
          let ruEntries: Record<string, string[]> | null = null;
          let nagerEntries: Record<string, string[]> = {};
          let ruLoadFailed = false;
          let nagerLoadFailed = false;

          try {
            ruEntries = await loadRuProductionCalendarYear(year);
          } catch (productionError) {
            if (isAbortError(productionError)) {
              return;
            }
            ruLoadFailed = true;
            console.error(productionError);
          }

          try {
            nagerEntries = await loadNagerYear(year);
          } catch (nagerError) {
            if (isAbortError(nagerError)) {
              return;
            }
            nagerLoadFailed = true;
            console.error(nagerError);
          }

          if (!active) return;

          if (ruEntries) {
            const merged = { ...ruEntries };
            Object.entries(nagerEntries).forEach(([date, labels]) => {
              const existing = merged[date] ?? [];
              labels.forEach((label) => {
                if (!existing.includes(label)) {
                  existing.push(label);
                }
              });
              merged[date] = existing;
            });
            mergeHolidayEntries(merged);
            loadedHolidayYears.current.add(year);
            return;
          }

          if (Object.keys(nagerEntries).length > 0) {
            mergeHolidayEntries(nagerEntries);
            loadedHolidayYears.current.add(year);
            return;
          }

          if (ruLoadFailed || nagerLoadFailed) {
            shouldRetry = true;
          }
          return;
        }

        const entries = await loadNagerYear(year);
        if (!active) return;
        mergeHolidayEntries(entries);
        loadedHolidayYears.current.add(year);
      } catch (error) {
        if (!isAbortError(error)) {
          console.error(error);
          shouldRetry = true;
        }
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
