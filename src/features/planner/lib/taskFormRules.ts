import { addDays, endOfMonth, format, isSameMonth, isSameYear, parseISO } from 'date-fns';

export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type RepeatEnds = 'never' | 'on' | 'after';

export type RepeatValidationError = 'missing_count' | 'missing_until';

type RepeatValidationMessages = {
  missingCount: string;
  missingUntil: string;
};

type RepeatConfigInput = {
  frequency: RepeatFrequency;
  ends: RepeatEnds;
  until: string;
  count: number | null | undefined;
};

export type RepeatCreateOptions = {
  frequency: Exclude<RepeatFrequency, 'none'>;
  ends: RepeatEnds;
  untilDate?: string;
  count?: number;
};

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

export const validateRepeatConfig = (params: RepeatConfigInput): RepeatValidationError | null => {
  if (params.frequency === 'none') return null;
  if (params.ends === 'after' && (!params.count || params.count < 1)) {
    return 'missing_count';
  }
  if (params.ends === 'on' && !params.until) {
    return 'missing_until';
  }
  return null;
};

export const parseRepeatCountInput = (rawValue: string): number | null => {
  if (rawValue.trim() === '') return 0;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

export const formatRepeatCountInputValue = (count: number): number | '' => (
  count > 0 ? count : ''
);

export const resolveRepeatValidationMessage = (
  params: RepeatConfigInput,
  messages: RepeatValidationMessages,
) => {
  const error = validateRepeatConfig(params);
  if (error === 'missing_count') return messages.missingCount;
  if (error === 'missing_until') return messages.missingUntil;
  return null;
};

export const buildCreateRepeatsOptions = (params: {
  frequency: Exclude<RepeatFrequency, 'none'>;
  ends: RepeatEnds;
  until: string;
  count: number;
}): RepeatCreateOptions => ({
  frequency: params.frequency,
  ends: params.ends,
  untilDate: params.ends === 'on' ? params.until : undefined,
  count: params.ends === 'after' ? params.count : undefined,
});

export const getAutoRepeatUntilOnFrequencyChange = (params: {
  nextFrequency: RepeatFrequency;
  currentEnds: RepeatEnds;
  baseDate: string;
}) => {
  if (params.nextFrequency === 'none' || params.currentEnds !== 'on') return null;
  return getDefaultRepeatUntil(params.baseDate);
};

export const getAutoRepeatUntilOnEndsChange = (params: {
  nextEnds: RepeatEnds;
  baseDate: string;
}) => {
  if (params.nextEnds !== 'on') return null;
  return getDefaultRepeatUntil(params.baseDate);
};

export const shouldAutoSyncRepeatUntil = (params: {
  frequency: RepeatFrequency;
  ends: RepeatEnds;
  auto: boolean;
}) => (
  params.auto
  && params.frequency !== 'none'
  && params.ends === 'on'
);
