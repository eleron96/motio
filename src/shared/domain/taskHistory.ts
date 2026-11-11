/** Task history (migration 0183): rows from `task_history`, read into typed changes. */

export interface TaskHistoryRow {
  id: string;
  actor_id: string | null;
  kind: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export interface TaskHistoryDates {
  start: string;
  end: string;
}

export type TaskHistoryChange =
  | { kind: 'title'; from: string; to: string }
  | { kind: 'dates'; from: TaskHistoryDates; to: TaskHistoryDates }
  | { kind: 'status'; from: string | null; to: string | null }
  | { kind: 'project'; from: string | null; to: string | null }
  | { kind: 'assignees'; added: string[]; removed: string[] }
  | { kind: 'description' };

export interface TaskHistoryEntry {
  id: string;
  actorId: string | null;
  at: string;
  change: TaskHistoryChange;
}

/** How many entries the card shows before "Show more", and the most it ever loads. */
export const TASK_HISTORY_PREVIEW = 5;
export const TASK_HISTORY_LIMIT = 50;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readValue = (value: unknown): unknown => (isRecord(value) ? value.v : undefined);

const readId = (value: unknown): string | null => {
  const id = readValue(value);
  return typeof id === 'string' ? id : null;
};

const readIds = (value: unknown): string[] => {
  const ids = readValue(value);
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
};

const readDates = (value: unknown): TaskHistoryDates | null => {
  if (!isRecord(value)) return null;
  const { start, end } = value;
  return typeof start === 'string' && typeof end === 'string' ? { start, end } : null;
};

const readChange = (row: TaskHistoryRow): TaskHistoryChange | null => {
  switch (row.kind) {
    case 'title': {
      const from = readValue(row.old_value);
      const to = readValue(row.new_value);
      return typeof from === 'string' && typeof to === 'string' ? { kind: 'title', from, to } : null;
    }
    case 'dates': {
      const from = readDates(row.old_value);
      const to = readDates(row.new_value);
      return from && to ? { kind: 'dates', from, to } : null;
    }
    case 'status':
    case 'project':
      return { kind: row.kind, from: readId(row.old_value), to: readId(row.new_value) };
    case 'assignees': {
      const before = readIds(row.old_value);
      const after = readIds(row.new_value);
      return {
        kind: 'assignees',
        added: after.filter((id) => !before.includes(id)),
        removed: before.filter((id) => !after.includes(id)),
      };
    }
    case 'description':
      return { kind: 'description' };
    default:
      return null;
  }
};

/** Rows of a kind this build does not know, or with a broken value, are skipped. */
export const toTaskHistoryEntries = (rows: TaskHistoryRow[]): TaskHistoryEntry[] =>
  rows.flatMap((row) => {
    const change = readChange(row);
    return change ? [{ id: row.id, actorId: row.actor_id, at: row.created_at, change }] : [];
  });

export interface TaskHistoryDay {
  /** Local calendar day, `yyyy-MM-dd`. */
  day: string;
  entries: TaskHistoryEntry[];
}

const localDayKey = (iso: string): string => {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/** Keeps the incoming order (newest first) and cuts it into runs of one local day. */
export const groupTaskHistoryByDay = (entries: TaskHistoryEntry[]): TaskHistoryDay[] => {
  const days: TaskHistoryDay[] = [];
  for (const entry of entries) {
    const day = localDayKey(entry.at);
    const last = days[days.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
};
