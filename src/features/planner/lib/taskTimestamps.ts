import { format, isSameDay, isSameYear, parseISO, subDays } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { t } from '@lingui/macro';
import { i18n } from '@lingui/core';
import { isSupportedLocale } from '@/shared/lib/locale';
import { resolveDateFnsLocale } from '@/shared/lib/dateFnsLocale';

export const formatTimestampLabel = (iso: string, now: Date, locale: DateFnsLocale) => {
  const date = parseISO(iso);
  if (isSameDay(date, now)) return t`today`;
  if (isSameDay(date, subDays(now, 1))) return t`yesterday`;
  return format(date, isSameYear(date, now) ? 'd MMMM' : 'd MMMM yyyy', { locale });
};

/** Compact task metadata; unknown authors leave the original date-only labels. */
export const formatTaskTimestamps = (
  createdAt: string | undefined,
  updatedAt: string | undefined,
  createdByName: string | null = null,
  updatedByName: string | null = null,
): string[] => {
  if (!createdAt) return [];
  const locale = resolveDateFnsLocale(isSupportedLocale(i18n.locale) ? i18n.locale : 'en');
  const now = new Date();
  const created = formatTimestampLabel(createdAt, now, locale);
  const createdLabel = createdByName
    ? t`Created by ${createdByName} · ${created}`
    : t`Created ${created}`;
  if (!updatedAt) return [createdLabel];
  const updated = formatTimestampLabel(updatedAt, now, locale);
  if (!createdByName && !updatedByName) return [t`Created ${created} · updated ${updated}`];
  return [
    createdLabel,
    updatedByName ? t`Updated by ${updatedByName} · ${updated}` : t`Updated ${updated}`,
  ];
};
