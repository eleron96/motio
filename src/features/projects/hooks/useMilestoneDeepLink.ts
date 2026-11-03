import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Milestone } from '@/features/planner/types/planner';
import type { ProjectsViewPreferences } from '@/features/projects/hooks/useProjectsViewPreferences';

interface UseMilestoneDeepLinkOptions {
  milestones: Milestone[];
  preferences: ProjectsViewPreferences;
  setSelectedMilestoneId: (milestoneId: string | null) => void;
}

/**
 * Deep link from elsewhere (e.g. the workload heatmap): /app/projects?milestone=<id>
 * opens the milestones view on that specific milestone. Waits for milestones to
 * load so the auto-select effect doesn't overwrite the choice, picks the matching
 * tab, and clears any owner-group filter that could hide it. The param is
 * consumed once.
 */
export const useMilestoneDeepLink = ({
  milestones,
  preferences,
  setSelectedMilestoneId,
}: UseMilestoneDeepLinkOptions) => {
  const { setMode, setMilestoneTab, setMilestoneOwnerGroupFilterIds } = preferences;
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkMilestoneAppliedRef = useRef(false);
  useEffect(() => {
    if (deepLinkMilestoneAppliedRef.current) return;
    const milestoneId = searchParams.get('milestone');
    if (!milestoneId) return;
    if (milestones.length === 0) return;
    deepLinkMilestoneAppliedRef.current = true;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('milestone');
      return next;
    }, { replace: true });
    const target = milestones.find((milestone) => milestone.id === milestoneId);
    if (!target) return;
    const todayKey = new Date().toISOString().slice(0, 10);
    setMode('milestones');
    setMilestoneTab(target.date >= todayKey ? 'active' : 'past');
    setMilestoneOwnerGroupFilterIds([]);
    setSelectedMilestoneId(target.id);
  }, [
    searchParams,
    milestones,
    setSearchParams,
    setMode,
    setMilestoneTab,
    setMilestoneOwnerGroupFilterIds,
    setSelectedMilestoneId,
  ]);
};
