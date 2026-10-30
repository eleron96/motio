import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/authStore';
import { isDemoPath } from '@/features/demo/hooks/useIsDemo';
import { isDemoUserId } from '@/features/demo/lib/demoIdentity';

/**
 * The way out of the sandbox is a full page load: every link that leaves
 * /demo is meant to reload. When one doesn't — a client-side navigation to
 * /app or /auth — the fake demo user is still in the auth store and the real
 * app would run as them. Reload the same address instead, so the real app
 * boots from a clean slate. (DemoBootstrap guards the opposite direction: a
 * real account reaching /demo.)
 */
export const DemoExitGuard = () => {
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const leakedOutOfDemo = !isDemoPath(location.pathname) && isDemoUserId(userId);

  useEffect(() => {
    if (!leakedOutOfDemo || typeof window === 'undefined') return;
    window.location.replace(`${location.pathname}${location.search}${location.hash}`);
  }, [leakedOutOfDemo, location.hash, location.pathname, location.search]);

  return null;
};
