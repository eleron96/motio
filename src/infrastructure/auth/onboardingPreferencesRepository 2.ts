import { supabase } from '@/shared/lib/supabaseClient';

export type ProfilePreferences = Record<string, unknown>;

export const fetchProfilePreferences = async (userId: string): Promise<ProfilePreferences | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return (data.preferences ?? {}) as ProfilePreferences;
};

export const updateProfilePreferences = async (
  userId: string,
  preferences: ProfilePreferences,
): Promise<void> => {
  await supabase
    .from('profiles')
    .update({ preferences })
    .eq('id', userId);
};
