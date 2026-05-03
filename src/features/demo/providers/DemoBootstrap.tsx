import { useEffect, useRef } from 'react';
import { Trans } from '@lingui/macro';
import { useAuthStore } from '@/features/auth/store/authStore';
import { demoStore } from '../lib/demoDataStore';
import { DemoBanner } from '../components/DemoBanner';
import { DemoConversionModal } from '../components/DemoConversionModal';
import { DemoConversionProvider, useDemoConversion } from './DemoConversionProvider';

interface DemoBootstrapProps {
  children: React.ReactNode;
}

const CONVERSION_TIMER_MS = 3 * 60_000;
const ACTIVITY_EVENTS: ReadonlyArray<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll'];

const DemoSessionShell = ({ children }: { children: React.ReactNode }) => {
  const { open } = useDemoConversion();
  const triggered = useRef(false);

  // Once-per-session "Save your work" prompt after 3 min of *active*
  // time (idle gaps don't accrue). Independent of the 24h TTL on the
  // sandbox itself.
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
      if (delta < 60_000) activeMs += delta;
      lastTick = now;
      if (!triggered.current && activeMs >= CONVERSION_TIMER_MS) {
        triggered.current = true;
        open('timer');
      }
    }, 30_000);
    return () => {
      window.clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      }
    };
  }, [open]);

  // Touch the demoStore on activity so the 24h idle window bumps as the
  // user uses the sandbox. visibilitychange catches a tab woken up
  // after a long sleep — if the saved state has expired we hard-reload
  // back into a fresh seed.
  useEffect(() => {
    const onActivity = () => demoStore.touch();
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (demoStore.isExpired()) {
        demoStore.reset();
        if (typeof window !== 'undefined') window.location.reload();
        return;
      }
      demoStore.touch();
    };
    if (typeof window !== 'undefined') {
      ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      if (typeof window !== 'undefined') {
        ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, []);

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

  // Eagerly hydrate the demo data store on first render of /demo so the
  // mock supabase client has rows ready before AuthProvider runs its
  // first getSession() / fetchWorkspaces().
  useEffect(() => {
    demoStore.get();
  }, []);

  if (loading || !user || !currentWorkspaceId) {
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
