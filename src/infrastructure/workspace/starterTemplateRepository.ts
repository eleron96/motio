import { supabase } from '@/shared/lib/supabaseClient';
import type { StarterTemplatePayload } from '@/shared/domain/starterTemplate';

/**
 * Lays a starter template into a workspace that is waiting for one
 * (`apply_workspace_template`, migration 0169): the catalogs are replaced and
 * the examples created in one transaction, or nothing changes at all.
 */
export const applyStarterTemplatePayload = async (
  workspaceId: string,
  payload: StarterTemplatePayload,
): Promise<{ error?: string }> => {
  const { error } = await supabase.rpc('apply_workspace_template', {
    p_workspace_id: workspaceId,
    p_template: payload,
  });
  return error ? { error: error.message } : {};
};
