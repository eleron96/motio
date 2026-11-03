import { getSupabase } from '@/shared/lib/supabaseClient';

/**
 * Asks which easter egg the signed-in person is assigned. The RPC filters on
 * auth.uid() and takes no argument, so it only ever returns the caller's own
 * assignment. The raw value is returned unchecked: the catalog decides what it
 * knows. Throws when the request is aborted.
 */
export const fetchMyDailyBriefEgg = async (
  signal: AbortSignal,
): Promise<{ key: unknown } | { error: string }> => {
  const { data, error } = await getSupabase()
    .rpc('get_my_daily_brief_egg')
    .abortSignal(signal);
  if (error) return { error: error.message };
  return { key: data };
};
