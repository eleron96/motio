import { useEffect } from 'react';
import { t } from '@lingui/macro';
import { toast } from '@/shared/ui/sonner';
import { APP_VERSION } from '@/shared/lib/appVersion';
import { fetchPublishedAppVersion } from '@/shared/lib/appVersionCheck';
import { isNotableUpdate } from '@/shared/domain/versionCompare';

const CHECK_INTERVAL_MS = 5 * 60_000;

/**
 * Tells an open tab that an important release is out, once, with an «Update»
 * button. Important means a new minor or major version (0.10.x → 0.11.0); patch
 * releases ship several times a day and are picked up quietly on the next page
 * load, so they do not interrupt anyone. It never reloads by itself: the person
 * may be in the middle of typing. Checks at most every 5 minutes while the tab
 * is visible, and when the person comes back to it.
 */
export function useNewVersionNotice(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || APP_VERSION === '0.0.0') return undefined;

    let active = true;
    let notified = false;
    let lastCheckAt = Date.now(); // the page has just loaded the current release

    const check = async () => {
      if (!active || notified || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastCheckAt < CHECK_INTERVAL_MS) return;
      lastCheckAt = now;
      const published = await fetchPublishedAppVersion().catch(() => null);
      if (!active || notified || !published || !isNotableUpdate(APP_VERSION, published)) return;
      notified = true;
      toast(t`A new version of Motio is available`, {
        duration: Infinity,
        action: { label: t`Update`, onClick: () => window.location.reload() },
      });
    };

    const timer = window.setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
    const onReturn = () => { void check(); };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, []);
}
