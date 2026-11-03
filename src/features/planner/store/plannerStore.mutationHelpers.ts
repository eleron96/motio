import { supabase } from '@/shared/lib/supabaseClient';
import { MutationResult } from '@/features/planner/store/plannerStore.helpers';

// Small helpers shared by the planner store's catalog slices.

export const emptyMutationResult: MutationResult = {};

export const getCurrentUserId = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { error: error.message };
  if (!data.user?.id) return { error: 'Not authenticated.' };
  return { userId: data.user.id };
};
