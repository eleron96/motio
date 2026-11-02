import { supabase } from '@/shared/lib/supabaseClient';

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}

// Persists (or reassigns to the current user) a browser push subscription via a
// SECURITY DEFINER upsert — see migration 0118 for why a plain client upsert
// cannot handle the shared-browser endpoint-collision case.
export const upsertPushSubscription = async (
  input: PushSubscriptionInput,
): Promise<{ error?: string }> => {
  const { error } = await supabase.rpc('upsert_push_subscription', {
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_user_agent: input.userAgent,
  });
  return error ? { error: error.message } : {};
};

export const deletePushSubscriptionByEndpoint = async (
  endpoint: string,
): Promise<{ error?: string }> => {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);
  return error ? { error: error.message } : {};
};
