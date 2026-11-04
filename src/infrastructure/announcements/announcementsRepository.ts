import { supabase } from '@/shared/lib/supabaseClient';

export type AnnouncementLevel = 'info' | 'critical';

/** An announcement as the server stores it: every language side by side. */
export interface AnnouncementRow {
  id: string;
  title_ru: string;
  title_en: string;
  /** Missing on a server older than migration 0171. */
  title_de?: string | null;
  body_ru: string | null;
  body_en: string | null;
  body_de?: string | null;
  level: AnnouncementLevel;
}

/** Announcements addressed to the signed-in person and not yet dismissed. */
export const fetchMyAnnouncements = async (): Promise<{ rows: AnnouncementRow[] } | { error: string }> => {
  const { data, error } = await supabase.rpc('get_my_announcements');
  if (error) return { error: error.message };
  return { rows: (data ?? []) as AnnouncementRow[] };
};

/** Records on the server that the signed-in person closed the announcement. */
export const dismissAnnouncement = async (announcementId: string): Promise<{ error?: string }> => {
  const { error } = await supabase.rpc('dismiss_announcement', {
    p_announcement_id: announcementId,
  });
  return error ? { error: error.message } : {};
};
