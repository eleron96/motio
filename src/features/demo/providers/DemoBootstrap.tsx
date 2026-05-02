import { useEffect, useRef, useState } from 'react';
import { Trans } from '@lingui/macro';
import { supabase } from '@/shared/lib/supabaseClient';
import { useAuthStore } from '@/features/auth/store/authStore';

interface DemoBootstrapProps {
  children: React.ReactNode;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_THRESHOLD_MS = 3 * 60_000;
const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll'];

export const DemoBootstrap = ({ children }: DemoBootstrapProps) => {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);

  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const signInAttempted = useRef(false);

  // Anonymous sign-in: only fire once per mount, only after AuthProvider
  // has resolved the initial session (loading === false). If a returning
  // visitor already has a demo session in localStorage, AuthProvider
  // will surface them as `user` and we skip sign-in entirely.
  useEffect(() => {
    if (loading) return;
    if (user) return;
    if (signInAttempted.current) return;
    signInAttempted.current = true;
    setSigningIn(true);
    void supabase.auth
      .signInAnonymously()
      .then(({ error }) => {
        if (error) {
          setSignInError(error.message);
        }
      })
      .catch((error: unknown) => {
        setSignInError(error instanceof Error ? error.message : 'Unknown error');
      })
      .finally(() => {
        setSigningIn(false);
      });
  }, [loading, user]);

  // Heartbeat: pings demo_heartbeat() every 30s while the user is active.
  // "Active" means an interaction happened within IDLE_THRESHOLD_MS. The
  // cleanup cron deletes anon users whose last heartbeat is older than
  // 10 minutes, so an open-but-idle tab is reaped naturally.
  useEffect(() => {
    if (!user) return;

    let lastActivity = Date.now();
    const onActivity = () => {
      lastActivity = Date.now();
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        lastActivity = Date.now();
      }
    };

    if (typeof window !== 'undefined') {
      ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    const ping = () => {
      if (Date.now() - lastActivity > IDLE_THRESHOLD_MS) return;
      void supabase.rpc('demo_heartbeat').then(() => undefined, () => undefined);
    };
    ping();
    const intervalId = window.setInterval(ping, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [user]);

  if (signInError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-sm font-medium">
          <Trans>Couldn't start the demo session.</Trans>
        </p>
        <p className="max-w-md text-xs text-muted-foreground">{signInError}</p>
      </div>
    );
  }

  if (loading || signingIn || !user || !currentWorkspaceId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Trans>Setting up your demo sandbox…</Trans>
      </div>
    );
  }

  return <>{children}</>;
};
