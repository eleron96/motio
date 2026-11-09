import { supabase } from '@/shared/lib/supabaseClient';

// workspaces.timeline_density (migration 0180), read and written only where the
// server setting timeline.density is on. Validation is the caller's.

export const readTimelineDensity = async (
  workspaceId: string,
): Promise<{ density: string } | { error: string }> => {
  const { data, error } = await supabase
    .from('workspaces')
    .select('timeline_density')
    .eq('id', workspaceId)
    .maybeSingle();
  if (error) return { error: error.message };
  return { density: (data as { timeline_density?: string } | null)?.timeline_density ?? 'normal' };
};

export const writeTimelineDensity = async (
  workspaceId: string,
  density: string,
): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from('workspaces')
    .update({ timeline_density: density })
    .eq('id', workspaceId);
  return error ? { error: error.message } : {};
};
