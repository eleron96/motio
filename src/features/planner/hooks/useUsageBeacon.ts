import { useEffect } from 'react';
import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';
import type { GroupMode, PlannerSurface, ViewMode } from '@/features/planner/types/planner';
import { recordUsageDay } from '@/infrastructure/usage/usageRepository';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import {
  classifyUsageDevice,
  usageSnapshotKey,
  type UsageSnapshot,
} from '@/shared/domain/usageDevice';

const LAST_SENT_STORAGE_KEY = 'motio-usage-day-sent';
// Wait until the view settles, so flipping through modes sends only the last one.
const SEND_DELAY_MS = 3000;

const readLastSent = (): string | null => {
  try {
    return window.localStorage.getItem(LAST_SENT_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeLastSent = (key: string) => {
  try {
    window.localStorage.setItem(LAST_SENT_STORAGE_KEY, key);
  } catch {
    // Private mode / blocked storage: we just send again next time.
  }
};

const matches = (query: string) =>
  typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

const readSnapshot = (view: {
  viewMode: ViewMode;
  plannerSurface: PlannerSurface;
  groupMode: GroupMode;
}): UsageSnapshot => {
  const { device, os } = classifyUsageDevice({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer: matches('(pointer: coarse)'),
    shortSide: Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0),
  });
  const standalone = matches('(display-mode: standalone)')
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { device, os, standalone, ...view };
};

interface UseUsageBeaconArgs {
  enabled: boolean;
  viewMode: ViewMode;
  plannerSurface: PlannerSurface;
  groupMode: GroupMode;
}

// Records once a day which device and planner view this person uses, and again
// only when that changes (migration 0154). Fire-and-forget: a failed send is
// retried on the next change or day and never bothers the user.
export const useUsageBeacon = ({ enabled, viewMode, plannerSurface, groupMode }: UseUsageBeaconArgs) => {
  const todayKey = useTodayKey();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || isDemoRoute()) return undefined;
    const timer = window.setTimeout(() => {
      const snapshot = readSnapshot({ viewMode, plannerSurface, groupMode });
      const key = usageSnapshotKey(snapshot, todayKey);
      if (readLastSent() === key) return;
      void recordUsageDay(snapshot).then(({ error }) => {
        if (!error) writeLastSent(key);
      });
    }, SEND_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, viewMode, plannerSurface, groupMode, todayKey]);
};
