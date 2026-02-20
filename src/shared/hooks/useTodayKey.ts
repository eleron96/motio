import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';

const getTodayKey = () => format(new Date(), 'yyyy-MM-dd');

const getMsUntilNextMidnight = () => {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(1000, nextMidnight.getTime() - now.getTime() + 50);
};

export const useTodayKey = () => {
  const [todayKey, setTodayKey] = useState(() => getTodayKey());

  const refreshTodayKey = useCallback(() => {
    setTodayKey((current) => {
      const next = getTodayKey();
      return current === next ? current : next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let midnightTimer: number | null = null;

    const scheduleMidnightRefresh = () => {
      if (midnightTimer !== null) {
        window.clearTimeout(midnightTimer);
      }
      midnightTimer = window.setTimeout(() => {
        refreshTodayKey();
        scheduleMidnightRefresh();
      }, getMsUntilNextMidnight());
    };

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshTodayKey();
      scheduleMidnightRefresh();
    };

    refreshTodayKey();
    scheduleMidnightRefresh();
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    }

    return () => {
      if (midnightTimer !== null) {
        window.clearTimeout(midnightTimer);
      }
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      }
    };
  }, [refreshTodayKey]);

  return todayKey;
};
