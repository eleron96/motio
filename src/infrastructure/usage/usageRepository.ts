import { supabase } from '@/shared/lib/supabaseClient';
import type { UsageSnapshot } from '@/shared/domain/usageDevice';

// Upserts today's usage row for the signed-in user (migration 0154). user_id
// and the day are decided on the server.
export const recordUsageDay = async (snapshot: UsageSnapshot): Promise<{ error?: string }> => {
  const { error } = await supabase.rpc('record_usage_day', {
    p_device: snapshot.device,
    p_os: snapshot.os,
    p_standalone: snapshot.standalone,
    p_view_mode: snapshot.viewMode,
    p_planner_surface: snapshot.plannerSurface,
    p_group_mode: snapshot.groupMode,
  });
  return error ? { error: error.message } : {};
};
