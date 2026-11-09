// Days off for a whole workspace (server setting workspaces.closures, table
// workspace_closures, migration 0179): a named date range a workspace admin
// sets. They count like public holidays everywhere the holiday map is used.

export type WorkspaceClosure = {
  id: string;
  name: string;
  /** ISO dates, both ends included. */
  startDate: string;
  endDate: string;
};

export type WorkspaceClosureInput = Pick<WorkspaceClosure, 'name' | 'startDate' | 'endDate'>;

export const CLOSURE_NAME_MAX = 80;
// The database allows one year at most (workspace_closures_dates_check).
export const CLOSURE_MAX_DAYS = 367;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoToUtc = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

const utcToIso = (time: number) => new Date(time).toISOString().slice(0, 10);

const DAY_MS = 86_400_000;

export type ClosureInputProblem = 'name' | 'dates' | 'too_long';

export const closureInputProblem = (input: WorkspaceClosureInput): ClosureInputProblem | null => {
  const name = input.name.trim();
  if (!name || name.length > CLOSURE_NAME_MAX) return 'name';
  if (!ISO_DATE.test(input.startDate) || !ISO_DATE.test(input.endDate)) return 'dates';
  const start = isoToUtc(input.startDate);
  const end = isoToUtc(input.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'dates';
  if ((end - start) / DAY_MS + 1 > CLOSURE_MAX_DAYS) return 'too_long';
  return null;
};

/**
 * Closure days inside [startIso, endIso], keyed by ISO date, each with the
 * names of the closures covering it. Clipped to the window, so a long closure
 * costs only the days that are actually shown.
 */
export const closureDaysByDate = (
  closures: readonly WorkspaceClosure[],
  window: { startIso: string; endIso: string },
): Record<string, string[]> => {
  const days: Record<string, string[]> = {};
  const windowStart = isoToUtc(window.startIso);
  const windowEnd = isoToUtc(window.endIso);
  for (const closure of closures) {
    if (!ISO_DATE.test(closure.startDate) || !ISO_DATE.test(closure.endDate)) continue;
    const from = Math.max(isoToUtc(closure.startDate), windowStart);
    const to = Math.min(isoToUtc(closure.endDate), windowEnd);
    const name = closure.name.trim();
    for (let time = from; time <= to; time += DAY_MS) {
      const iso = utcToIso(time);
      const names = days[iso] ?? [];
      if (!names.includes(name)) names.push(name);
      days[iso] = names;
    }
  }
  return days;
};

/**
 * Holidays plus closures: a day that is both is still one day off, with both
 * names. Returns the holiday map itself when there is nothing to add, so that
 * everything keyed on it stays as it was.
 */
export const withClosures = (
  holidays: Record<string, string[]>,
  closureDays: Record<string, string[]>,
): Record<string, string[]> => {
  const isos = Object.keys(closureDays);
  if (isos.length === 0) return holidays;
  const merged: Record<string, string[]> = { ...holidays };
  for (const iso of isos) {
    const names = [...(holidays[iso] ?? [])];
    for (const name of closureDays[iso]) {
      if (!names.includes(name)) names.push(name);
    }
    merged[iso] = names;
  }
  return merged;
};

/** Upcoming and current closures first (by start), past ones after, newest first. */
export const sortClosures = (closures: readonly WorkspaceClosure[], todayIso: string): WorkspaceClosure[] => {
  const upcoming = closures.filter((closure) => closure.endDate >= todayIso)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = closures.filter((closure) => closure.endDate < todayIso)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return [...upcoming, ...past];
};
