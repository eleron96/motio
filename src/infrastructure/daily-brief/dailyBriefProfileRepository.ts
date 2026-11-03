import { supabase } from '@/shared/lib/supabaseClient';

/** The profile fields the daily brief decides on. */
export interface DailyBriefProfile {
  shownDate: string | null;
  preferences: Record<string, unknown>;
  createdAt: string | null;
}

/** Reads the person's daily-brief fields; an unreadable profile reads as empty. */
export const fetchDailyBriefProfile = async (userId: string): Promise<DailyBriefProfile> => {
  const { data } = await supabase
    .from('profiles')
    .select('daily_brief_shown_date, preferences, created_at')
    .eq('id', userId)
    .single();

  return {
    shownDate: (data?.daily_brief_shown_date as string | null | undefined) ?? null,
    preferences: (data?.preferences ?? {}) as Record<string, unknown>,
    createdAt: (data?.created_at as string | null | undefined) ?? null,
  };
};

/** Remembers on the server the day the brief was last shown (`YYYY-MM-DD`). */
export const saveDailyBriefShownDate = async (userId: string, date: string): Promise<void> => {
  await supabase
    .from('profiles')
    .update({ daily_brief_shown_date: date })
    .eq('id', userId);
};
