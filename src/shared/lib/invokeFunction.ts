import { supabase } from '@/shared/lib/supabaseClient';

type InvokeResult = Awaited<ReturnType<typeof supabase.functions.invoke>>;

/**
 * Calls an edge function; on 401 refreshes the session once and calls again.
 *
 * The functions check the caller with the auth service, which can refuse an
 * access token the database still accepts — a token issued by an older auth
 * version is one (GoTrue 2.197 rejects tokens without `aud`). A fresh token
 * from the refresh token passes. When the refresh fails too (the session is
 * gone), the 401 result is returned for the caller to ask for a new sign-in.
 */
export const invokeFunction = async (name: string, body: unknown): Promise<InvokeResult> => {
  const result = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (!result.error || result.response?.status !== 401) {
    return result;
  }
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    return result;
  }
  return supabase.functions.invoke(name, { body: body as Record<string, unknown> });
};
