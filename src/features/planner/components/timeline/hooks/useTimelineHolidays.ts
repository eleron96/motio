import { useMemo } from 'react';
import { t } from '@lingui/macro';
import { normalizeHolidayCountryCode, useHolidayMap } from '@/features/planner/hooks/useHolidayMap';
import type { WorkspaceSummary } from '@/features/auth/store/authStore.contract';

interface UseTimelineHolidaysOptions {
  visibleDays: Date[];
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
}

/** Days off of the workspace's country (and region) across the visible window. */
export const useTimelineHolidays = ({
  visibleDays,
  workspaces,
  currentWorkspaceId,
}: UseTimelineHolidaysOptions) => {
  const visibleHolidayYears = useMemo(
    () => Array.from(new Set(visibleDays.map((day) => day.getFullYear()))),
    [visibleDays],
  );
  const holidayCountryCode = useMemo(() => {
    const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId);
    return normalizeHolidayCountryCode(currentWorkspace?.holidayCountry);
  }, [workspaces, currentWorkspaceId]);
  const holidayRegionCode = useMemo(() => (
    workspaces.find((workspace) => workspace.id === currentWorkspaceId)?.holidayRegion ?? null
  ), [workspaces, currentWorkspaceId]);
  const { holidayDates } = useHolidayMap({
    years: visibleHolidayYears,
    holidayCountryCode,
    holidayRegionCode,
    fallbackHolidayLabel: t`Non-working day`,
    holidayLabel: t`Holiday`,
  });
  return holidayDates;
};
