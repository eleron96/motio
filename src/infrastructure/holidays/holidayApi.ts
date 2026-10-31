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
  /** false = observed only in `counties`; missing in responses cached before regions. */
  global?: boolean;
  counties?: string[] | null;
}

export interface HolidayResponse {
  holidays: HolidayEntry[];
  productionCalendar: string | null;
}

export interface HolidayCountryOption {
  countryCode: string;
  name: string;
}

const CACHE_PREFIX = 'motio.holidays.v1:';
const cacheKey = (country: string, year: number) => `${country}:${year}`;

/** Answers known on this page: from this session's requests or the saved copy. */
const knownAnswers = new Map<string, HolidayResponse>();
/** Requests of this page session: the server is asked once per country and year. */
const sessionRequests = new Map<string, Promise<HolidayResponse>>();

const isHolidayResponse = (value: unknown): value is HolidayResponse => (
  typeof value === 'object'
  && value !== null
  && Array.isArray((value as HolidayResponse).holidays)
  && ((value as HolidayResponse).productionCalendar === null
    || typeof (value as HolidayResponse).productionCalendar === 'string')
);

/**
 * Holidays saved earlier — in this session or on a previous visit — so the
 * timeline can paint weekends-off with its first frame instead of after a
 * request. Null when this country and year were never loaded here.
 */
export const readCachedHolidays = (country: string, year: number): HolidayResponse | null => {
  const key = cacheKey(country, year);
  const known = knownAnswers.get(key);
  if (known) return known;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isHolidayResponse(parsed)) return null;
    knownAnswers.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Asks the server once per page session for a country and year; every later
 * caller gets the same answer. A saved copy from a previous visit is still
 * refreshed once: the production calendar for next year is published late.
 * A failed request is forgotten, so the next call tries again.
 */
export const fetchHolidays = (country: string, year: number): Promise<HolidayResponse> => {
  const key = cacheKey(country, year);
  const pending = sessionRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    const res = await fetch(
      `${getBaseUrl()}?country=${encodeURIComponent(country)}&year=${year}`,
    );
    if (!res.ok) {
      throw new Error(`Holiday fetch failed: ${res.status}`);
    }
    const response = await res.json() as HolidayResponse;
    knownAnswers.set(key, response);
    try {
      window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(response));
    } catch {
      // Storage full or blocked: the answer still serves this session.
    }
    return response;
  })();
  sessionRequests.set(key, request);
  request.catch(() => {
    if (sessionRequests.get(key) === request) sessionRequests.delete(key);
  });
  return request;
};

/** Test helper: forgets this session's answers (the saved copies stay). */
export const resetHolidayCacheForTests = () => {
  knownAnswers.clear();
  sessionRequests.clear();
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
