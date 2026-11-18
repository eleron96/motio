import { t } from '@lingui/macro';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { formatDayAndMonth } from '@/shared/lib/dateFnsLocale';
import type { Locale } from '@/shared/lib/locale';
import type { WorkspaceRole } from '@/features/auth/store/authStore';

export const roleLabel = (role: WorkspaceRole) => {
  if (role === 'admin') return t`Admin`;
  if (role === 'editor') return t`Editor`;
  return t`Viewer`;
};

/**
 * The second line of a reminder in the bell: when the task starts, relative to
 * the day the person is looking at it ("today" on the day itself, the date later).
 */
export const reminderLabel = (taskStartDate: string | null, todayIso: string, locale: Locale) => {
  if (!taskStartDate) return t`Reminder`;
  if (taskStartDate === todayIso) return t`Reminder: starts today`;
  if (differenceInCalendarDays(parseISO(taskStartDate), parseISO(todayIso)) === 1) {
    return t`Reminder: starts tomorrow`;
  }
  const dateLabel = formatDayAndMonth(taskStartDate, locale);
  return taskStartDate > todayIso
    ? t`Reminder: starts on ${dateLabel}`
    : t`Reminder: started on ${dateLabel}`;
};

export const formatNotificationDate = (isoDate: string) => {
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) return '';
  return new Date(parsed).toLocaleString();
};
