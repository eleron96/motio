import { supabase } from '@/shared/lib/supabaseClient';
import { parseInvokeError } from '@/shared/lib/parseInvokeError';
import { PUSH_ACTIONS } from '@/shared/contracts/actions';

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

// Asks the server to send a test push to the caller's own devices. Returns how
// many devices it reached.
export const sendTestPush = async (): Promise<{ sent?: number; error?: string }> => {
  const { data, error, response } = await supabase.functions.invoke('push', {
    body: { action: PUSH_ACTIONS.TEST },
  });
  if (error) {
    return { error: await parseInvokeError(error, response) };
  }
  const payload = (data as { sent?: number; error?: string } | null) ?? null;
  if (payload?.error) return { error: payload.error };
  return { sent: payload?.sent ?? 0 };
};
