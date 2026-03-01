import React, { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabaseClient';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import {
  broadcastAuthSessionSync,
  getAuthSessionStateFromStorageEvent,
  isSupabaseAuthStorageKey,
} from '@/features/auth/lib/authSessionSync';
import { markRecentSignOut } from '@/features/auth/lib/recentSignOut';

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const setSession = useAuthStore((state) => state.setSession);
  const setLoading = useAuthStore((state) => state.setLoading);
  const resolveSuperAdmin = useAuthStore((state) => state.resolveSuperAdmin);
  const fetchWorkspaces = useAuthStore((state) => state.fetchWorkspaces);
  const fetchProfile = useAuthStore((state) => state.fetchProfile);
  const resetPlanner = usePlannerStore((state) => state.reset);

  useEffect(() => {
    let active = true;
    let lastSessionKey: string | null = null;
    let lastAuthState: 'signed-in' | 'signed-out' | null = null;
    let hasHydratedSession = false;
    let reconcileInFlight = false;
    let lastReconcileAt = 0;

    const sessionKey = (session: Session | null) => {
      if (!session?.user) return 'signed-out';
      return session.access_token
        ? `${session.user.id}:${session.access_token}`
        : session.user.id;
    };

    const handleSession = async (
      session: Session | null,
      force = false,
      options: { broadcast?: boolean } = {},
    ) => {
      if (!active) return;
      const nextSessionKey = sessionKey(session);
      if (!force && lastSessionKey === nextSessionKey) {
        return;
      }
      lastSessionKey = nextSessionKey;

      setSession(session);
      const nextAuthState: 'signed-in' | 'signed-out' = session?.user ? 'signed-in' : 'signed-out';
      if (!hasHydratedSession) {
        hasHydratedSession = true;
        lastAuthState = nextAuthState;
      } else if (nextAuthState !== lastAuthState) {
        lastAuthState = nextAuthState;
        if (options.broadcast !== false) {
          broadcastAuthSessionSync(nextAuthState);
        }
      }
      if (session?.user) {
        try {
          const isSuperAdmin = await resolveSuperAdmin(session.user);
          if (!active) return;
          if (!isSuperAdmin) {
            fetchWorkspaces();
          }
          fetchProfile();
        } catch (_error) {
          if (!active) return;
          fetchWorkspaces();
          fetchProfile();
        }
      } else {
        resetPlanner();
      }
      setLoading(false);
    };

    const reconcileSession = async (reason: string, force = false) => {
      if (!active) return;
      const now = Date.now();
      if (reconcileInFlight) return;
      if (!force && now - lastReconcileAt < 700) return;

      reconcileInFlight = true;
      lastReconcileAt = now;

      try {
        const { data } = await supabase.auth.getSession();
        await handleSession(data.session, false, { broadcast: false });
      } catch (_error) {
        // Keep current state on transient session read failures.
      } finally {
        reconcileInFlight = false;
      }
      if (!active) return;
      if (reason === 'mount') {
        setLoading(false);
      }
    };

    setLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        return;
      }
      void handleSession(session);
    });
    void reconcileSession('mount', true);

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void reconcileSession('focus');
    };

    const handleOnline = () => {
      void reconcileSession('online', true);
    };

    const handleStorage = (event: StorageEvent) => {
      const syncState = getAuthSessionStateFromStorageEvent(event);
      if (syncState === 'signed-out') {
        // A remote tab initiated logout: mark recent sign-out locally to force prompt=login.
        markRecentSignOut();
        void handleSession(null, true, { broadcast: false });
        void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        return;
      }
      if (syncState === 'signed-in' || isSupabaseAuthStorageKey(event.key)) {
        void reconcileSession('storage', true);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleVisibilityOrFocus);
      window.addEventListener('online', handleOnline);
      window.addEventListener('storage', handleStorage);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    }

    return () => {
      active = false;
      subscription.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleVisibilityOrFocus);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('storage', handleStorage);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      }
    };
  }, [fetchProfile, fetchWorkspaces, resetPlanner, resolveSuperAdmin, setLoading, setSession]);

  return <>{children}</>;
};
