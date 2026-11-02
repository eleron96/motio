import { useEffect } from 'react';

/**
 * Mirrors a count onto the installed-PWA app icon (Badging API). Pushes set the
 * badge while the app is closed; this keeps it in sync — and clears it —
 * whenever the app is open and the count changes.
 */
export const useAppIconBadge = (enabled: boolean, count: number) => {
  useEffect(() => {
    // A disabled feed never counts anything, so it must not clear the badge the
    // enabled one just set (both are mounted on desktop, only one is live).
    if (!enabled) return;
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== 'function') return;
    if (count > 0) {
      nav.setAppBadge(count).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [count, enabled]);
};
