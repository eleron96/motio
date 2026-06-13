import { useMemo } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useTodayKey } from '@/shared/hooks/useTodayKey';
import { computeProfileSummary, type ProfileSummaryData } from '@/features/auth/lib/profileSummary';

/**
 * Personal account stats derived from the already-loaded planner store.
 * Shared by the Profile tab's summary block and its footer (tenure line).
 */
export const useProfileSummary = (): ProfileSummaryData => {
  const user = useAuthStore((state) => state.user);
  const tasks = usePlannerStore((state) => state.tasks);
  const statuses = usePlannerStore((state) => state.statuses);
  const projects = usePlannerStore((state) => state.projects);
  const assignees = usePlannerStore((state) => state.assignees);
  const todayKey = useTodayKey();

  return useMemo(
    () =>
      computeProfileSummary({
        tasks,
        statuses,
        projects,
        assignees,
        userId: user?.id,
        accountCreatedAt: user?.created_at,
        todayKey,
      }),
    [tasks, statuses, projects, assignees, user?.id, user?.created_at, todayKey],
  );
};
