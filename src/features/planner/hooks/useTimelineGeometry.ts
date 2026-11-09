import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useTimelineDensityStore } from '@/features/planner/store/timelineDensityStore';
import {
  NORMAL_TIMELINE_GEOMETRY,
  TIMELINE_GEOMETRY,
  type TimelineDensity,
  type TimelineGeometry,
} from '@/features/planner/lib/timelineDensity';
import { useInstanceSetting } from '@/shared/store/instanceSettingsStore';
import { useIsMobile } from '@/shared/hooks/use-mobile';

/**
 * The current workspace's timeline density — 'normal' unless the server allows
 * a choice (Admin → Settings → Timeline density). No request while it is off.
 */
export const useTimelineDensity = (): TimelineDensity => {
  const enabled = useInstanceSetting('timeline.density');
  const workspaceId = useAuthStore((state) => state.currentWorkspaceId);
  const stored = useTimelineDensityStore((state) => (
    enabled && workspaceId ? state.byWorkspace[workspaceId] : undefined
  ));
  const load = useTimelineDensityStore((state) => state.load);

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    void load(workspaceId);
  }, [enabled, workspaceId, load]);

  return enabled && stored ? stored : 'normal';
};

/**
 * Bar and row sizes for the timeline. Phones always get the usual sizes; with
 * the setting off this is always the same NORMAL object, so nothing memoized
 * downstream sees a change.
 */
export const useTimelineGeometry = (): TimelineGeometry => {
  const density = useTimelineDensity();
  const isMobile = useIsMobile();
  return isMobile ? NORMAL_TIMELINE_GEOMETRY : TIMELINE_GEOMETRY[density];
};
