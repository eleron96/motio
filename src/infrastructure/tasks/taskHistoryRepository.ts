import { supabase } from '@/shared/lib/supabaseClient';
import type { TaskHistoryRow } from '@/shared/domain/taskHistory';

export interface TaskHistoryPage {
  /** Newest first. */
  rows: TaskHistoryRow[];
  /** All rows of the last year, not only the loaded ones. */
  total: number;
  /** Display names by profile id; a purged or nameless profile maps to null. */
  actorNames: Record<string, string | null>;
}

interface ActorProfileRow {
  id: string;
  display_name: string | null;
  status: string | null;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Reads the history of the open card under the `task_history` and profile RLS. */
export const fetchTaskHistory = async (taskId: string, limit: number): Promise<TaskHistoryPage> => {
  const since = new Date(Date.now() - YEAR_MS).toISOString();
  const { data, error, count } = await supabase
    .from('task_history')
    .select('id, actor_id, kind, old_value, new_value, created_at', { count: 'exact' })
    .eq('task_id', taskId)
    .gte('created_at', since)
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
    actorNames[profile.id] = profile.status === 'PURGED' ? null : profile.display_name?.trim() || null;
  }
  return { rows, total: count ?? rows.length, actorNames };
};
