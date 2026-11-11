import { format, isSameDay, isSameYear, parseISO } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { t } from '@lingui/macro';
import type { TaskHistoryDates, TaskHistoryEntry } from '@/shared/domain/taskHistory';

/** Names for the ids a history row carries; an id that no longer exists reads as a dash. */
export interface TaskHistoryNames {
  actor: (id: string | null) => string | null;
  status: (id: string) => string | null;
  project: (id: string) => string | null;
  assignee: (id: string) => string | null;
}

export interface TaskHistoryLine {
  /** Who did what: "Anna moved the dates". */
  title: string;
  /** What changed, "from → to"; null when the title says it all. */
  detail: string | null;
}

const MISSING = '—';

const formatDay = (iso: string, now: Date, locale: DateFnsLocale) => {
  const date = parseISO(iso);
  return format(date, isSameYear(date, now) ? 'd MMM' : 'd MMM yyyy', { locale });
};

const formatDates = (dates: TaskHistoryDates, now: Date, locale: DateFnsLocale) => {
  const start = formatDay(dates.start, now, locale);
  if (isSameDay(parseISO(dates.start), parseISO(dates.end))) return start;
  return `${start} – ${formatDay(dates.end, now, locale)}`;
};

const arrow = (from: string, to: string) => `${from} → ${to}`;

/** One history entry as two short lines of plain language. */
export const describeTaskHistoryEntry = (
  entry: TaskHistoryEntry,
  names: TaskHistoryNames,
  locale: DateFnsLocale,
  now: Date = new Date(),
): TaskHistoryLine => {
  const name = names.actor(entry.actorId) ?? t`Someone`;
  const { change } = entry;

  switch (change.kind) {
    case 'title':
      return { title: t`${name} renamed the task`, detail: arrow(change.from, change.to) };
    case 'dates':
      return {
        title: t`${name} moved the dates`,
        detail: arrow(formatDates(change.from, now, locale), formatDates(change.to, now, locale)),
      };
    case 'status':
      return {
        title: t`${name} changed the status`,
        detail: arrow(
          change.from ? names.status(change.from) ?? MISSING : MISSING,
          change.to ? names.status(change.to) ?? MISSING : MISSING,
        ),
      };
    case 'project': {
      const noProject = t`No project`;
      return {
        title: t`${name} changed the project`,
        detail: arrow(
          change.from ? names.project(change.from) ?? MISSING : noProject,
          change.to ? names.project(change.to) ?? MISSING : noProject,
        ),
      };
    }
    case 'assignees': {
      const list = (ids: string[]) => ids.map((id) => names.assignee(id) ?? MISSING).join(', ');
      const parts = [
        change.added.length > 0 ? `+ ${list(change.added)}` : null,
        change.removed.length > 0 ? `− ${list(change.removed)}` : null,
      ].filter((part): part is string => part !== null);
      return {
        title: t`${name} changed the assignees`,
        detail: parts.length > 0 ? parts.join(' · ') : null,
      };
    }
    case 'description':
      return { title: t`${name} edited the description`, detail: null };
  }
};
