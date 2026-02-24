import { addDays, endOfMonth, format, isSameMonth, isSameYear, parseISO } from 'date-fns';

export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type RepeatEnds = 'never' | 'on' | 'after';

export type RepeatValidationError = 'missing_count' | 'missing_until';

type ProjectQueryKeyInput = {
  currentQuery: string;
  key: string;
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

export const normalizeProjectQuery = (value: string) => value.trim().toLowerCase();

export const filterProjectsByQuery = <T extends { name: string; code: string | null }>(
  projects: T[],
  rawQuery: string,
) => {
  const query = normalizeProjectQuery(rawQuery);
  if (!query) return projects;
  return projects.filter((project) => (
    project.name.toLowerCase().includes(query)
    || (project.code ?? '').toLowerCase().includes(query)
  ));
};

/**
 * Converts keyboard input from project combobox trigger into next search query.
 * Returns null when the key should be ignored.
 */
export const resolveProjectQueryFromKeyDown = ({
  currentQuery,
  key,
  isComposing,
  altKey,
  ctrlKey,
  metaKey,
}: ProjectQueryKeyInput): string | null => {
  if (isComposing) return null;

  if (key === 'Backspace') {
    if (!currentQuery) return null;
    return currentQuery.slice(0, -1);
  }

  if (key === 'Escape') {
    if (!currentQuery) return null;
    return '';
  }

  const isPrintableKey = key.length === 1
    && !altKey
    && !ctrlKey
    && !metaKey;
  if (!isPrintableKey) return null;

  return currentQuery + key;
};

export const getDefaultRepeatUntil = (baseDate: string) => {
  const start = parseISO(baseDate);
  const next = addDays(start, 1);
  if (isSameMonth(next, start) && isSameYear(next, start)) {
    return format(next, 'yyyy-MM-dd');
  }
  return format(endOfMonth(start), 'yyyy-MM-dd');
};

export const validateRepeatConfig = (params: {
  frequency: RepeatFrequency;
  ends: RepeatEnds;
  until: string;
  count: number | null | undefined;
}): RepeatValidationError | null => {
  if (params.frequency === 'none') return null;
  if (params.ends === 'after' && (!params.count || params.count < 1)) {
    return 'missing_count';
  }
  if (params.ends === 'on' && !params.until) {
    return 'missing_until';
  }
  return null;
};
