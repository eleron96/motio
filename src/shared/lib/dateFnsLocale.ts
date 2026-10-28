import { format } from 'date-fns';
import type { Locale as DateFnsLocale } from 'date-fns';
import { de, enUS, ru } from 'date-fns/locale';
import type { Locale } from '@/shared/lib/locale';

const DATE_FNS_LOCALES: Record<Locale, DateFnsLocale> = { en: enUS, ru, de };

export const resolveDateFnsLocale = (locale: Locale): DateFnsLocale => DATE_FNS_LOCALES[locale];

const RU_WEEKDAY_SHORT_BY_INDEX: Record<number, string> = {
  0: 'Вс',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
};

export const formatWeekdayLabel = (
  date: Date,
  locale: Locale,
  options?: {
    style?: 'narrow' | 'short' | 'abbreviated';
    dateLocale?: DateFnsLocale;
  },
): string => {
  if (locale === 'ru') {
    return RU_WEEKDAY_SHORT_BY_INDEX[date.getDay()];
  }

  const style = options?.style ?? 'short';
  const token = style === 'narrow'
    ? 'EEEEE'
    : style === 'abbreviated'
      ? 'EEE'
      : 'EE';

  return format(date, token, { locale: options?.dateLocale ?? resolveDateFnsLocale(locale) });
};
