const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * In-memory cache for holiday data.
 * Key: `${countryCode}:${year}`, value: { data, fetchedAt }.
 * Edge Function instances are long-lived — the cache survives across requests
 * and is evicted after CACHE_TTL_MS.
 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * GET /holidays?country=RU&year=2026
 *
 * Proxies requests to date.nager.at and isdayoff.ru, caching results
 * so that browser clients never hit these external APIs directly
 * (avoiding geo-blocking / ERR_CONNECTION_CLOSED issues).
 *
 * Response shape:
 * {
 *   holidays: Array<{ date: string; localName: string; name: string }>;
 *   productionCalendar: string | null;   // raw isdayoff.ru payload for RU
 * }
 *
 * GET /holidays?action=countries
 *
 * Returns the list of available country codes from nager.at.
 *
 * Response shape:
 * Array<{ countryCode: string; name: string }>
 */
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "countries") {
    return handleCountries();
  }

  const country = (url.searchParams.get("country") ?? "").trim().toUpperCase();
  const yearParam = url.searchParams.get("year") ?? "";
  const year = parseInt(yearParam, 10);

  if (!/^[A-Z]{2}$/.test(country)) {
    return jsonResponse({ error: "Invalid country code" }, 400);
  }
  if (!year || year < 2000 || year > 2100) {
    return jsonResponse({ error: "Invalid year" }, 400);
  }

  const cacheKey = `${country}:${year}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return jsonResponse(cached.data);
  }

  try {
    const result = await fetchHolidayData(country, year);
    cache.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return jsonResponse(result);
  } catch (err) {
    console.error("Holiday fetch error:", err);
    // Return stale cache if available
    if (cached) {
      return jsonResponse(cached.data);
    }
    return jsonResponse(
      { error: "Failed to fetch holiday data", holidays: [], productionCalendar: null },
      502,
    );
  }
}

const COUNTRIES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
let countriesCache: CacheEntry | null = null;

async function handleCountries(): Promise<Response> {
  if (countriesCache && Date.now() - countriesCache.fetchedAt < COUNTRIES_CACHE_TTL_MS) {
    return jsonResponse(countriesCache.data);
  }

  try {
    const res = await fetch("https://date.nager.at/api/v3/AvailableCountries");
    if (!res.ok) throw new Error(`nager.at countries: ${res.status}`);
    const data = await res.json();
    countriesCache = { data, fetchedAt: Date.now() };
    return jsonResponse(data);
  } catch (err) {
    console.error("Countries fetch error:", err);
    if (countriesCache) {
      return jsonResponse(countriesCache.data);
    }
    return jsonResponse({ error: "Failed to fetch countries" }, 502);
  }
}

interface HolidayData {
  holidays: Array<{ date: string; localName: string; name: string }>;
  productionCalendar: string | null;
}

async function fetchHolidayData(
  country: string,
  year: number,
): Promise<HolidayData> {
  const nagerPromise = fetchNager(country, year);
  const productionPromise =
    country === "RU" ? fetchIsDayOff(year) : Promise.resolve(null);

  const [holidays, productionCalendar] = await Promise.all([
    nagerPromise,
    productionPromise,
  ]);

  return { holidays, productionCalendar };
}

async function fetchNager(
  country: string,
  year: number,
): Promise<Array<{ date: string; localName: string; name: string }>> {
  const res = await fetch(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`,
  );
  if (!res.ok) {
    throw new Error(`nager.at responded with ${res.status}`);
  }
  const data = (await res.json()) as Array<{
    date?: string;
    localName?: string;
    name?: string;
  }>;
  return data
    .filter((h) => h.date)
    .map((h) => ({
      date: h.date!,
      localName: h.localName ?? h.name ?? "",
      name: h.name ?? "",
    }));
}

async function fetchIsDayOff(year: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://isdayoff.ru/api/getdata?year=${year}&cc=ru`,
    );
    if (!res.ok) return null;
    const raw = (await res.text()).trim();
    if (!raw || !/^[0-9]+$/.test(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}
