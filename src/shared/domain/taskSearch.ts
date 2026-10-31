/**
 * Finding tasks by title on the timeline ("lens" search): the timeline itself
 * shows the result — matching bars stay, the rest fades — and a strip above it
 * shows every match on a time axis, including the ones outside the screen.
 */

export interface TaskSearchCandidate {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  projectId: string | null;
  repeatId: string | null;
}

export interface TaskSearchDateRange {
  start: string;
  end: string;
}

/** Shortest query that is searched at all: one letter matches half the list. */
export const MIN_TASK_SEARCH_QUERY_LENGTH = 2;

/** Case- and «ё»-insensitive form used for matching. Same length as the input. */
export const normalizeSearchText = (value: string): string => (
  value.toLocaleLowerCase('ru').replace(/ё/g, 'е')
);

export const normalizeSearchQuery = (query: string): string => (
  normalizeSearchText(query.trim().replace(/\s+/g, ' '))
);

export const isSearchableQuery = (query: string): boolean => (
  normalizeSearchQuery(query).length >= MIN_TASK_SEARCH_QUERY_LENGTH
);

/** Where the query sits in the title (for underlining), or null. */
export const findTitleMatch = (
  title: string,
  query: string,
): { start: number; end: number } | null => {
  const needle = normalizeSearchQuery(query);
  if (!needle) return null;
  const start = normalizeSearchText(title).indexOf(needle);
  return start < 0 ? null : { start, end: start + needle.length };
};

/** Splits a title around its match: [before, match, after]. */
export const splitTitleAtMatch = (title: string, query: string): [string, string, string] | null => {
  const match = findTitleMatch(title, query);
  if (!match) return null;
  return [title.slice(0, match.start), title.slice(match.start, match.end), title.slice(match.end)];
};

const daysBetween = (from: string, to: string) => (
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
);

/** How far a task is from `today`: 0 if it is running, else days to its nearer end. */
const distanceFromToday = (task: TaskSearchCandidate, today: string) => {
  if (task.startDate <= today && task.endDate >= today) return 0;
  return task.startDate > today ? daysBetween(today, task.startDate) : daysBetween(task.endDate, today);
};

/**
 * Matching tasks, one per repeat series (the occurrence nearest to today) and
 * merged from several sources by id, ordered by date.
 */
export const collectTaskSearchHits = <T extends TaskSearchCandidate>(
  sources: ReadonlyArray<readonly T[]>,
  query: string,
  today: string,
): T[] => {
  const byId = new Map<string, T>();
  sources.forEach((source) => source.forEach((task) => {
    if (!byId.has(task.id) && findTitleMatch(task.title, query)) byId.set(task.id, task);
  }));

  const nearestBySeries = new Map<string, T>();
  const singles: T[] = [];
  byId.forEach((task) => {
    if (!task.repeatId) {
      singles.push(task);
      return;
    }
    const current = nearestBySeries.get(task.repeatId);
    if (!current || distanceFromToday(task, today) < distanceFromToday(current, today)) {
      nearestBySeries.set(task.repeatId, task);
    }
  });

  return [...singles, ...nearestBySeries.values()].sort((left, right) => (
    left.startDate.localeCompare(right.startDate) || left.title.localeCompare(right.title)
  ));
};

/** Hits before, on and after the visible part of the timeline. */
export const splitHitsByRange = <T extends TaskSearchCandidate>(
  hits: readonly T[],
  range: TaskSearchDateRange | null,
): { before: T[]; inside: T[]; after: T[] } => {
  if (!range) return { before: [], inside: [...hits], after: [] };
  const before: T[] = [];
  const inside: T[] = [];
  const after: T[] = [];
  hits.forEach((hit) => {
    if (hit.endDate < range.start) before.push(hit);
    else if (hit.startDate > range.end) after.push(hit);
    else inside.push(hit);
  });
  return { before, inside, after };
};

export interface TaskSearchStripLayout {
  /** First and last day of the strip (whole months). */
  start: string;
  end: string;
  months: { key: string; offset: number }[];
  ticks: { id: string; offset: number }[];
  window: { offset: number; width: number } | null;
}

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const addMonths = (date: string, months: number) => {
  const [year, month] = date.split('-').map(Number);
  const total = year * 12 + (month - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
};

/**
 * Positions (0…1) on the strip: whole months from the earliest to the latest
 * of the hits and the visible range, at least `minMonths` wide.
 */
export const layoutTaskSearchStrip = (
  hits: readonly TaskSearchCandidate[],
  range: TaskSearchDateRange | null,
  minMonths = 6,
): TaskSearchStripLayout | null => {
  const dates = hits.map((hit) => hit.startDate);
  if (range) dates.push(range.start, range.end);
  if (dates.length === 0) return null;
  dates.sort();
  let start = monthStart(dates[0]);
  let end = addMonths(monthStart(dates[dates.length - 1]), 1);
  // Too short: widen around the middle so a lone match isn't pinned to an edge.
  let toggle = false;
  while (daysBetween(start, end) < minMonths * 30) {
    if (toggle) start = addMonths(start, -1);
    else end = addMonths(end, 1);
    toggle = !toggle;
  }
  const span = daysBetween(start, end);
  const at = (date: string) => Math.min(1, Math.max(0, daysBetween(start, date) / span));

  const months: TaskSearchStripLayout['months'] = [];
  for (let month = start; month < end; month = addMonths(month, 1)) {
    months.push({ key: month, offset: at(month) });
  }

  return {
    start,
    end,
    months,
    ticks: hits.map((hit) => ({ id: hit.id, offset: at(hit.startDate) })),
    window: range ? { offset: at(range.start), width: Math.max(0.004, at(range.end) - at(range.start)) } : null,
  };
};
