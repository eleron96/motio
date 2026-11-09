import { supabase } from '@/shared/lib/supabaseClient';
import type { WorkspaceClosure, WorkspaceClosureInput } from '@/shared/domain/workspaceClosures';

// workspace_closures (migration 0179): members read, workspace admins write (RLS).

type ClosureRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

const mapClosure = (row: ClosureRow): WorkspaceClosure => ({
  id: row.id,
  name: row.name,
  startDate: row.start_date,
  endDate: row.end_date,
});

const toRow = (input: WorkspaceClosureInput) => ({
  name: input.name.trim(),
  start_date: input.startDate,
  end_date: input.endDate,
});

export const listWorkspaceClosures = async (
  workspaceId: string,
): Promise<{ closures: WorkspaceClosure[] } | { error: string }> => {
  const { data, error } = await supabase
    .from('workspace_closures')
    .select('id, name, start_date, end_date')
    .eq('workspace_id', workspaceId)
    .order('start_date', { ascending: true });
  if (error) return { error: error.message };
  return { closures: ((data ?? []) as ClosureRow[]).map(mapClosure) };
};

export const createWorkspaceClosure = async (
  workspaceId: string,
  input: WorkspaceClosureInput,
): Promise<{ closure: WorkspaceClosure } | { error: string }> => {
  const { data, error } = await supabase
    .from('workspace_closures')
    .insert({ workspace_id: workspaceId, ...toRow(input) })
    .select('id, name, start_date, end_date')
    .single();
  if (error || !data) return { error: error?.message ?? 'Could not save.' };
  return { closure: mapClosure(data as ClosureRow) };
};

export const updateWorkspaceClosure = async (
  workspaceId: string,
  id: string,
  input: WorkspaceClosureInput,
): Promise<{ closure: WorkspaceClosure } | { error: string }> => {
  const { data, error } = await supabase
    .from('workspace_closures')
    .update(toRow(input))
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select('id, name, start_date, end_date')
    .single();
  if (error || !data) return { error: error?.message ?? 'Could not save.' };
  return { closure: mapClosure(data as ClosureRow) };
};

export const deleteWorkspaceClosure = async (
  workspaceId: string,
  id: string,
): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from('workspace_closures')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId);
  return error ? { error: error.message } : {};
};
