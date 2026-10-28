// Public holidays that only some regions observe (German states, Swiss cantons,
// US states…). The holiday source marks them `global: false` and lists the
// regions in `counties` as ISO 3166-2 codes ("DE-BY"). Without a region a
// workspace sees only the holidays of the whole country.

export interface RegionalHolidayScope {
  global?: boolean | null;
  counties?: string[] | null;
}

export interface NamedRegionalHoliday extends RegionalHolidayScope {
  date: string;
  localName: string;
  name: string;
}

const HOLIDAY_REGION_PATTERN = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

// Native names, the way people in the region write them. Countries missing here
// fall back to the ISO code.
const HOLIDAY_REGION_NAMES: Record<string, string> = {
  'DE-BW': 'Baden-Württemberg',
  'DE-BY': 'Bayern',
  'DE-BE': 'Berlin',
  'DE-BB': 'Brandenburg',
  'DE-HB': 'Bremen',
  'DE-HH': 'Hamburg',
  'DE-HE': 'Hessen',
  'DE-MV': 'Mecklenburg-Vorpommern',
  'DE-NI': 'Niedersachsen',
  'DE-NW': 'Nordrhein-Westfalen',
  'DE-RP': 'Rheinland-Pfalz',
  'DE-SL': 'Saarland',
  'DE-SN': 'Sachsen',
  'DE-ST': 'Sachsen-Anhalt',
  'DE-SH': 'Schleswig-Holstein',
  'DE-TH': 'Thüringen',
  'AT-1': 'Burgenland',
  'AT-2': 'Kärnten',
  'AT-3': 'Niederösterreich',
  'AT-4': 'Oberösterreich',
  'AT-5': 'Salzburg',
  'AT-6': 'Steiermark',
  'AT-7': 'Tirol',
  'AT-8': 'Vorarlberg',
  'AT-9': 'Wien',
  'CH-AG': 'Aargau',
  'CH-AI': 'Appenzell Innerrhoden',
  'CH-AR': 'Appenzell Ausserrhoden',
  'CH-BE': 'Bern',
  'CH-BL': 'Basel-Landschaft',
  'CH-BS': 'Basel-Stadt',
  'CH-FR': 'Fribourg',
  'CH-GE': 'Genève',
  'CH-GL': 'Glarus',
  'CH-GR': 'Graubünden',
  'CH-JU': 'Jura',
  'CH-LU': 'Luzern',
  'CH-NE': 'Neuchâtel',
  'CH-NW': 'Nidwalden',
  'CH-OW': 'Obwalden',
  'CH-SG': 'St. Gallen',
  'CH-SH': 'Schaffhausen',
  'CH-SO': 'Solothurn',
  'CH-SZ': 'Schwyz',
  'CH-TG': 'Thurgau',
  'CH-TI': 'Ticino',
  'CH-UR': 'Uri',
  'CH-VD': 'Vaud',
  'CH-VS': 'Valais',
  'CH-ZG': 'Zug',
  'CH-ZH': 'Zürich',
};

/** A region code that belongs to the country, or null ("the whole country"). */
export const normalizeHolidayRegionCode = (
  value: string | null | undefined,
  countryCode: string,
): string | null => {
  const code = (value ?? '').trim().toUpperCase();
  if (!HOLIDAY_REGION_PATTERN.test(code)) return null;
  return code.startsWith(`${countryCode.trim().toUpperCase()}-`) ? code : null;
};

/**
 * A holiday counts when the whole country observes it, or when it is observed
 * in the workspace's region. A holiday without the `global` flag (an older
 * response) counts as national, so nothing disappears by accident.
 */
export const isHolidayObservedInRegion = (
  holiday: RegionalHolidayScope,
  regionCode: string | null,
): boolean => {
  if (holiday.global !== false) return true;
  if (!regionCode) return false;
  return (holiday.counties ?? []).includes(regionCode);
};

/** Regions that have holidays of their own, sorted by their display name. */
export const listHolidayRegions = (holidays: RegionalHolidayScope[]): string[] => {
  const regions = new Set<string>();
  holidays.forEach((holiday) => {
    if (holiday.global !== false) return;
    (holiday.counties ?? []).forEach((code) => {
      if (HOLIDAY_REGION_PATTERN.test(code)) regions.add(code);
    });
  });
  return Array.from(regions).sort((left, right) => (
    getHolidayRegionName(left).localeCompare(getHolidayRegionName(right))
  ));
};

/** Names of the holidays a region adds on top of the national ones. */
export const listRegionOnlyHolidayNames = (
  holidays: NamedRegionalHoliday[],
  regionCode: string,
): string[] => {
  const names: string[] = [];
  holidays.forEach((holiday) => {
    if (holiday.global !== false) return;
    if (!(holiday.counties ?? []).includes(regionCode)) return;
    const name = holiday.localName || holiday.name;
    if (name && !names.includes(name)) names.push(name);
  });
  return names;
};

export const getHolidayRegionName = (regionCode: string): string => (
  HOLIDAY_REGION_NAMES[regionCode] ?? regionCode
);
