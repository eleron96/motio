import { useEffect, useMemo, useState } from 'react';
import { addDays, format, isWeekend, startOfYear } from 'date-fns';
import {
  fetchHolidays,
  readCachedHolidays,
  type HolidayResponse,
} from '@/infrastructure/holidays/holidayApi';
import {
  isEmptyProductionCalendar,
  russianStatutoryHolidays,
} from '@/features/planner/lib/russianHolidays';
import { isHolidayObservedInRegion } from '@/shared/domain/holidayRegion';

const HOLIDAY_RETRY_DELAY_MS = 30000;
const DEFAULT_HOLIDAY_COUNTRY_CODE = 'RU';

export const normalizeHolidayCountryCode = (value: string | null | undefined) => {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : DEFAULT_HOLIDAY_COUNTRY_CODE;
};

type UseHolidayMapParams = {
  years: number[];
  holidayCountryCode: string;
  /** Region whose own holidays count too; null = national holidays only. */
  holidayRegionCode: string | null;
  fallbackHolidayLabel: string;
  holidayLabel: string;
};

type HolidayLabels = {
  countryCode: string;
  regionCode: string | null;
  fallbackHolidayLabel: string;
  holidayLabel: string;
};

/** Days off of one year, by ISO date, from the server's answer. */
const buildHolidayEntries = (
  response: HolidayResponse,
  year: number,
  { countryCode, regionCode, fallbackHolidayLabel, holidayLabel }: HolidayLabels,
) => {
  const entries: Record<string, string[]> = {};

  // Production calendar for RU. Ordinary Saturdays and Sundays are
  // skipped: isdayoff marks EVERY non-working day, weekends included, so
  // keeping them would paint half the calendar as a holiday. What this
  // branch adds are the working days the government turned into days off
  // (3 and 10 May 2027, say). Holidays that legitimately fall on a
  // weekend — 3 January, for instance — arrive below, from the named
  // holidays and from the statutory fallback, and are NOT filtered there.
  if (countryCode === 'RU') {
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
        const day = addDays(yearStart, index);
        if (isWeekend(day)) continue;
        entries[format(day, 'yyyy-MM-dd')] = [fallbackHolidayLabel];
      }
    }
  }

  // Merge named holidays on top. Regional ones count only for the
  // workspace's region: Bavaria's Corpus Christi is a working day in Hamburg.
  response.holidays.forEach((holiday) => {
    if (!holiday.date) return;
    if (!isHolidayObservedInRegion(holiday, regionCode)) return;
    const label = holiday.localName || holiday.name || holidayLabel;
    const existing = entries[holiday.date] ?? [];
    if (!existing.includes(label)) {
      entries[holiday.date] = [...existing, label];
    }
  });

  return entries;
};

const answerKey = (countryCode: string, year: number) => `${countryCode}:${year}`;

export const useHolidayMap = ({
  years,
  holidayCountryCode,
  holidayRegionCode,
  fallbackHolidayLabel,
  holidayLabel,
}: UseHolidayMapParams) => {
  // Server answers of this session, by country and year. Until one arrives,
  // the copy saved on an earlier visit stands in (readCachedHolidays), so a
  // returning visitor sees the days off with the first paint.
  const [answers, setAnswers] = useState<Record<string, HolidayResponse>>({});
  const [holidayReloadToken, setHolidayReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    let retryTimer: number | null = null;
    let failed = false;

    void Promise.all(years.map(async (year) => {
      try {
        const response = await fetchHolidays(holidayCountryCode, year);
        if (!active) return;
        const key = answerKey(holidayCountryCode, year);
        setAnswers((prev) => (prev[key] === response ? prev : { ...prev, [key]: response }));
      } catch (error) {
        console.error(error);
        failed = true;
      }
    })).then(() => {
      if (!active || !failed) return;
      retryTimer = window.setTimeout(() => {
        setHolidayReloadToken((prev) => prev + 1);
      }, HOLIDAY_RETRY_DELAY_MS);
    });

    return () => {
      active = false;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [years, holidayCountryCode, holidayReloadToken]);

  const holidayMap = useMemo(() => {
    const labels: HolidayLabels = {
      countryCode: holidayCountryCode,
      regionCode: holidayRegionCode,
      fallbackHolidayLabel,
      holidayLabel,
    };
    const map: Record<string, string[]> = {};
    years.forEach((year) => {
      const response = answers[answerKey(holidayCountryCode, year)]
        ?? readCachedHolidays(holidayCountryCode, year);
      if (!response) return;
      Object.assign(map, buildHolidayEntries(response, year, labels));
    });
    return map;
  }, [answers, years, holidayCountryCode, holidayRegionCode, fallbackHolidayLabel, holidayLabel]);

  const holidayDates = useMemo(() => new Set(Object.keys(holidayMap)), [holidayMap]);

  return {
    holidayMap,
    holidayDates,
  };
};
