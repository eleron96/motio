import type { TaskSearchHit } from '@/features/planner/types/planner';
import { mapTaskRow, type TaskMappedRow } from '@/shared/domain/taskRowMapper';
import { isSearchableQuery, normalizeSearchQuery } from '@/shared/domain/taskSearch';
import { supabase } from '@/shared/lib/supabaseClient';

type TaskSearchRow = Omit<TaskMappedRow, 'description'> & { matched_subtask_title: string | null };

/** Lightweight matches across the workspace; these rows never enter the task cache. */
export const fetchTaskSearchHits = async (
  workspaceId: string,
  query: string,
): Promise<{ tasks: TaskSearchHit[]; error?: string }> => {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!workspaceId || !isSearchableQuery(normalizedQuery)) return { tasks: [] };

  const { data, error } = await supabase.rpc('search_workspace_tasks', {
    p_workspace_id: workspaceId,
    p_query: normalizedQuery,
  });
  if (error) return { tasks: [], error: error.message };

  return {
    tasks: ((data ?? []) as unknown as TaskSearchRow[]).map((row) => ({
      ...mapTaskRow({ ...row, description: undefined }),
      matchedSubtaskTitle: row.matched_subtask_title ?? null,
    })),
  };
};
