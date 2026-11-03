import { format, isSameDay, isSameYear, parseISO, subDays } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { t } from '@lingui/macro';
import { i18n } from '@lingui/core';
import { isSupportedLocale } from '@/shared/lib/locale';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';

const formatTimestampLabel = (iso: string, now: Date, locale: DateFnsLocale) => {
  const date = parseISO(iso);
  if (isSameDay(date, now)) return t`today`;
  if (isSameDay(date, subDays(now, 1))) return t`yesterday`;
  return format(date, isSameYear(date, now) ? 'd MMMM' : 'd MMMM yyyy', { locale });
};

/** The task card's footer line: «Created 9 June · updated today». */
export const formatTaskTimestamps = (createdAt: string | undefined, updatedAt: string | undefined) => {
  if (!createdAt) return null;
  const locale = resolveDateFnsLocale(isSupportedLocale(i18n.locale) ? i18n.locale : 'en');
  const now = new Date();
  const created = formatTimestampLabel(createdAt, now, locale);
  if (!updatedAt) return t`Created ${created}`;
  const updated = formatTimestampLabel(updatedAt, now, locale);
  return t`Created ${created} · updated ${updated}`;
};
