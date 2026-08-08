import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabaseClient';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useLocaleStore } from '@/shared/store/localeStore';

export type AnnouncementLevel = 'info' | 'critical';

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  level: AnnouncementLevel;
}

interface AnnouncementRow {
  id: string;
  title_ru: string;
  title_en: string;
  body_ru: string | null;
  body_en: string | null;
  level: AnnouncementLevel;
}

/**
 * Announcements addressed to the signed-in person and not yet dismissed.
 *
 * Dismissal is recorded server-side, so an announcement closed on the desktop
 * does not greet the same person again on their phone — "show it once" means
 * once per person, not once per browser. The list is hidden optimistically so
 * the banner disappears under the finger rather than after a round trip.
 */
export const useAnnouncements = () => {
  const user = useAuthStore((state) => state.user);
  const locale = useLocaleStore((state) => state.locale);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) {
      setAnnouncements([]);
      return;
    }

    let active = true;

    const load = async () => {
      const { data, error } = await supabase.rpc('get_my_announcements');
      if (!active) return;
      if (error) {
        // A missing announcement is not worth interrupting anyone over.
        console.error(error);
        return;
      }
      const rows = (data ?? []) as AnnouncementRow[];
      setAnnouncements(rows.map((row) => ({
        id: row.id,
        title: locale === 'ru' ? row.title_ru : row.title_en,
        body: (locale === 'ru' ? row.body_ru : row.body_en) || null,
        level: row.level,
      })));
    };

    void load();

    return () => {
      active = false;
    };
  }, [locale, user]);

  const dismiss = useCallback(async (announcementId: string) => {
    setAnnouncements((current) => current.filter((item) => item.id !== announcementId));
    const { error } = await supabase.rpc('dismiss_announcement', {
      p_announcement_id: announcementId,
    });
    if (error) console.error(error);
  }, []);

  return { announcements, dismiss };
};
