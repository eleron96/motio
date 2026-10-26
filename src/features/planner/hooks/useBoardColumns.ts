import { useEffect, useMemo } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { buildAssigneeGroupMap, selectFilteredTasks } from '@/features/planner/lib/timelineSelectors';
import {
  buildBoardColumns,
  countOpenBoardCardsByAssignee,
  type BoardColumn,
  type BoardQuickFilters,
} from '@/shared/domain/boardColumns';
import { useTodayKey } from '@/shared/hooks/useTodayKey';

/**
 * Claims the board scope while the board is on screen: loads every open task
 * into the shared cache and releases it on leave. Reloads when the status set
 * changes (a new status, or one flipped to finished), since the scope freezes
 * the open status ids.
 */
export const useBoardScopeLifecycle = (workspaceId: string | null) => {
  const loadBoardTasks = usePlannerStore((state) => state.loadBoardTasks);
  const releaseBoardScope = usePlannerStore((state) => state.releaseBoardScope);
  const statusSignature = usePlannerStore((state) => state.statuses
    .map((status) => `${status.id}:${status.isFinal ? 1 : 0}${status.isCancelled ? 1 : 0}`)
    .sort()
    .join(','));

  useEffect(() => {
    if (!workspaceId || !statusSignature) return;
    void loadBoardTasks(workspaceId);
  }, [workspaceId, statusSignature, loadBoardTasks]);

  useEffect(() => () => releaseBoardScope(), [releaseBoardScope]);
};

/** Board columns for the current filters — the board UI only renders these. */
export const useBoardColumns = ({ search, overdueOnly }: BoardQuickFilters = {}): BoardColumn[] => {
  const tasks = usePlannerStore((state) => state.tasks);
  const statuses = usePlannerStore((state) => state.statuses);
  const boardScope = usePlannerStore((state) => state.boardScope);
  const filters = usePlannerStore((state) => state.filters);
  const assignees = usePlannerStore((state) => state.assignees);
  const memberGroupAssignments = usePlannerStore((state) => state.memberGroupAssignments);
  const today = useTodayKey();

  const assigneeGroupMap = useMemo(
    () => buildAssigneeGroupMap(assignees, memberGroupAssignments),
    [assignees, memberGroupAssignments],
  );
  const filteredTasks = useMemo(
    () => selectFilteredTasks(tasks, filters, assigneeGroupMap, assignees),
    [tasks, filters, assigneeGroupMap, assignees],
  );

  return useMemo(
    () => buildBoardColumns({
      statuses,
      tasks: filteredTasks,
      scope: boardScope,
      today,
      statusFilterIds: filters.statusIds,
      quick: { search, overdueOnly },
    }),
    [statuses, filteredTasks, boardScope, today, filters.statusIds, search, overdueOnly],
  );
};

/** Open board cards per person, before any filter — orders the people chips. */
export const useBoardPeopleCounts = (): Map<string, number> => {
  const tasks = usePlannerStore((state) => state.tasks);
  const statuses = usePlannerStore((state) => state.statuses);
  const boardScope = usePlannerStore((state) => state.boardScope);
  const today = useTodayKey();
  return useMemo(
    () => countOpenBoardCardsByAssignee(tasks, statuses, boardScope, today),
    [tasks, statuses, boardScope, today],
  );
};
