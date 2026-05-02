import { useEffect, useRef, useState } from 'react';
import { Trans } from '@lingui/macro';
import { Link } from 'react-router-dom';
import { supabase, isDemoConfigured } from '@/shared/lib/supabaseClient';
import { Button } from '@/shared/ui/button';
import { useAuthStore } from '@/features/auth/store/authStore';
import { DemoBanner } from '../components/DemoBanner';
import { DemoConversionModal } from '../components/DemoConversionModal';
import { DemoConversionProvider, useDemoConversion } from './DemoConversionProvider';

interface DemoBootstrapProps {
  children: React.ReactNode;
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_THRESHOLD_MS = 3 * 60_000;
const CONVERSION_TIMER_MS = 3 * 60_000;
const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll'];

// Lives inside DemoConversionProvider so it can call open('timer').
// Mounts banner + modal and runs the once-per-session conversion timer.
const DemoSessionShell = ({ children }: { children: React.ReactNode }) => {
  const { open } = useDemoConversion();
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    let activeMs = 0;
    let lastTick = Date.now();
    const onActivity = () => {
      lastTick = Date.now();
    };

    if (typeof window !== 'undefined') {
      ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const delta = now - lastTick;
      // Count time toward the threshold only when the user actually
      // interacted in the previous tick window. Idle time doesn't accrue.
      if (delta < HEARTBEAT_INTERVAL_MS * 1.5) {
        activeMs += delta;
      }
      lastTick = now;

      if (!triggered.current && activeMs >= CONVERSION_TIMER_MS) {
        triggered.current = true;
        open('timer');
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      }
    };
  }, [open]);

  return (
    <>
      <DemoBanner />
      {children}
      <DemoConversionModal />
    </>
  );
};

export const DemoBootstrap = ({ children }: DemoBootstrapProps) => {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const currentWorkspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const demoConfigured = isDemoConfigured();

  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const signInAttempted = useRef(false);

  // Anonymous sign-in: only fire once per mount, only after AuthProvider
  // has resolved the initial session (loading === false). If a returning
  // visitor already has a demo session in localStorage, AuthProvider
  // will surface them as `user` and we skip sign-in entirely.
  useEffect(() => {
    if (!demoConfigured) return;
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
  }, [demoConfigured, loading, user]);

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

  if (!demoConfigured) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-xl font-semibold">
          <Trans>Demo is not configured</Trans>
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          <Trans>
            VITE_SUPABASE_URL_DEMO and VITE_SUPABASE_ANON_KEY_DEMO are not set on this build.
            The demo sandbox needs an isolated Supabase project to run.
          </Trans>
        </p>
        <Button asChild variant="outline">
          <Link to="/">
            <Trans>Back to landing</Trans>
          </Link>
        </Button>
      </div>
    );
  }

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

  return (
    <DemoConversionProvider>
      <DemoSessionShell>{children}</DemoSessionShell>
    </DemoConversionProvider>
  );
};
