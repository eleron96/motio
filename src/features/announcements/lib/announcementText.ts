import type { AnnouncementRow } from '@/infrastructure/announcements/announcementsRepository';
import type { Locale } from '@/shared/lib/locale';

/**
 * The title and body a reader sees in their interface language. German is
 * optional: without a German title the reader gets the English pair, so a
 * title and a body never come from two different languages.
 */
export const announcementText = (
  row: AnnouncementRow,
  locale: Locale,
): { title: string; body: string | null } => {
  if (locale === 'ru') return { title: row.title_ru, body: row.body_ru || null };
  if (locale === 'de' && row.title_de) return { title: row.title_de, body: row.body_de || null };
  return { title: row.title_en, body: row.body_en || null };
};
