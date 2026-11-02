import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabaseClient';

export type AuthSession = Session;

/** The session this browser holds right now, or null when signed out. */
export const readCurrentSession = async (): Promise<AuthSession | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session;
};

/**
 * Calls `listener` on every sign-in and sign-out. Token refreshes are left
 * out: the person and their data stay the same. Returns the unsubscribe.
 */
export const subscribeToSessionChanges = (
  listener: (session: AuthSession | null) => void,
): (() => void) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return;
    listener(session);
  });
  return () => subscription.unsubscribe();
};

/** Drops the session in this browser only; other devices stay signed in. */
export const signOutLocally = async (): Promise<void> => {
  await supabase.auth.signOut({ scope: 'local' });
};
