import { supabase } from '@/shared/lib/supabaseClient';

export interface TaskAttribution {
  createdByName: string | null;
  updatedByName: string | null;
  /**
   * Set only for a live account whose profile has no name, so the caller may
   * name the person another way. A purged or unreadable author has neither.
   */
  createdByUserId?: string;
  updatedByUserId?: string;
}

interface TaskAttributionRow {
  created_by: string | null;
  updated_by: string | null;
}

interface AuthorProfileRow {
  id: string;
  display_name: string | null;
  status: string | null;
}

/** Reads attribution only for the open card, under the task and profile RLS. */
export const fetchTaskAttribution = async (taskId: string, updatedAt?: string): Promise<TaskAttribution> => {
  let query = supabase
    .from('tasks')
    .select('created_by, updated_by')
    .eq('id', taskId);
  // A newer task row may arrive before live sync updates the card's date.
  // Wait for that version instead of attaching its editor to the old date.
  if (updatedAt) query = query.eq('updated_at', updatedAt);
  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(error.message);

  const row = data as unknown as TaskAttributionRow | null;
  const authorIds = Array.from(new Set(
    [row?.created_by, row?.updated_by].filter((id): id is string => Boolean(id)),
  ));
  if (authorIds.length === 0) return { createdByName: null, updatedByName: null };

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, status')
    .in('id', authorIds);

  if (profilesError) throw new Error(profilesError.message);

  const profileRows = (profiles ?? []) as unknown as AuthorProfileRow[];
  const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const resolve = (id: string | null | undefined): { name: string | null; userId?: string } => {
    const profile = id ? profilesById.get(id) : undefined;
    if (!profile || profile.status === 'PURGED') return { name: null };
    const name = profile.display_name?.trim() || null;
    return name ? { name } : { name: null, userId: profile.id };
  };
  const created = resolve(row?.created_by);
  const updated = resolve(row?.updated_by);

  return {
    createdByName: created.name,
    updatedByName: updated.name,
    createdByUserId: created.userId,
    updatedByUserId: updated.userId,
  };
};
