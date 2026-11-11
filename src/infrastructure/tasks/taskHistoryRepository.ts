import { supabase } from '@/shared/lib/supabaseClient';
import type { TaskHistoryRow } from '@/shared/domain/taskHistory';

export interface TaskHistoryPage {
  /** Newest first. */
  rows: TaskHistoryRow[];
  /** All rows the database keeps for the task, not only the loaded ones. */
  total: number;
  /** Display names of live accounts by profile id, null when the profile has no name. A purged account is absent. */
  actorNames: Record<string, string | null>;
}

interface ActorProfileRow {
  id: string;
  display_name: string | null;
  status: string | null;
}

/**
 * Reads the history of the open card under the `task_history` and profile RLS.
 * Retention is the database's job (a year, plus the latest entry of the task).
 */
export const fetchTaskHistory = async (taskId: string, limit: number): Promise<TaskHistoryPage> => {
  const { data, error, count } = await supabase
    .from('task_history')
    .select('id, actor_id, kind, old_value, new_value, created_at', { count: 'exact' })
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, limit - 1);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as TaskHistoryRow[];
  const actorIds = Array.from(new Set(
    rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)),
  ));
  if (actorIds.length === 0) return { rows, total: count ?? rows.length, actorNames: {} };

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, status')
    .in('id', actorIds);

  if (profilesError) throw new Error(profilesError.message);

  const profileRows = (profiles ?? []) as unknown as ActorProfileRow[];
  const actorNames: Record<string, string | null> = {};
  for (const profile of profileRows) {
    if (profile.status === 'PURGED') continue;
    actorNames[profile.id] = profile.display_name?.trim() || null;
  }
  return { rows, total: count ?? rows.length, actorNames };
};
