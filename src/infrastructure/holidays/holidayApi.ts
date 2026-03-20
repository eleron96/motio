const trimTrailingSlash = (v: string) => v.replace(/\/+$/, '');

const getBaseUrl = () => {
  const supabaseUrl = trimTrailingSlash(
    (import.meta.env.VITE_SUPABASE_URL ?? '').trim(),
  );
  return `${supabaseUrl}/functions/v1/holidays`;
};

export interface HolidayEntry {
  date: string;
  localName: string;
  name: string;
}

export interface HolidayResponse {
  holidays: HolidayEntry[];
  productionCalendar: string | null;
}

export interface HolidayCountryOption {
  countryCode: string;
  name: string;
}

export const fetchHolidays = async (
  country: string,
  year: number,
  signal?: AbortSignal,
): Promise<HolidayResponse> => {
  const res = await fetch(
    `${getBaseUrl()}?country=${encodeURIComponent(country)}&year=${year}`,
    { signal },
  );
  if (!res.ok) {
    throw new Error(`Holiday fetch failed: ${res.status}`);
  }
  return res.json() as Promise<HolidayResponse>;
};

export const fetchHolidayCountries = async (
  signal?: AbortSignal,
): Promise<HolidayCountryOption[]> => {
  const res = await fetch(`${getBaseUrl()}?action=countries`, { signal });
  if (!res.ok) {
    throw new Error(`Holiday countries fetch failed: ${res.status}`);
  }
  return res.json() as Promise<HolidayCountryOption[]>;
};
