import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useDisplayTaskRows, countTaskUnits } from '@/features/planner/hooks/useDisplayTaskRows';
import { useTaskScopeFilter } from '@/features/planner/hooks/useTaskScopeFilter';
import { useMemberTaskFetcher } from '@/features/members/hooks/useMemberTaskFetcher';
import { useMemberTaskDetails } from '@/features/members/hooks/useMemberTaskDetails';
import { useMemberTaskSelection } from '@/features/members/hooks/useMemberTaskSelection';
import { useMemberTaskFilterToggles } from '@/features/members/hooks/useMemberTaskFilterToggles';
import type { MemberTasksPanelProps } from '@/features/members/components/MemberTasksPanel';
import type { Status, Tag } from '@/features/planner/types/planner';

const PAGE_SIZE = 100;

interface UseMemberTasksViewOptions {
  currentWorkspaceId: string | null;
  selectedAssigneeId: string | null;
  mode: 'tasks' | 'groups';
  statusById: Map<string, Status>;
  tagById: Map<string, Tag>;
}

/**
 * The tasks of the person picked on the members page: scope, filters and
 * paging, the multi-select with its delete, comment counts, and the task open
 * in the details dialog. `panelProps` is everything the tasks panel needs
 * except the person themselves.
 */
export const useMemberTasksView = ({
  currentWorkspaceId,
  selectedAssigneeId,
  mode,
  statusById,
  tagById,
}: UseMemberTasksViewOptions) => {
  const {
    projects,
    statuses,
    taskCommentCounts,
    refreshTaskCommentCounts,
    fetchAssigneeTaskCounts,
    deleteTasks,
  } = usePlannerStore(useShallow((state) => ({
    projects: state.projects,
    statuses: state.statuses,
    taskCommentCounts: state.taskCommentCounts,
    refreshTaskCommentCounts: state.refreshTaskCommentCounts,
    fetchAssigneeTaskCounts: state.fetchAssigneeTaskCounts,
    deleteTasks: state.deleteTasks,
  })));
  const [search, setSearch] = useState('');
  const [projectFilterIds, setProjectFilterIds] = useState<string[]>([]);
  const {
    taskScope, setTaskScope,
    pastFromDate, setPastFromDate,
    pastToDate, setPastToDate,
    pastSort, setPastSort,
    pageIndex, setPageIndex,
    statusFilterIds, setStatusFilterIds,
  } = useTaskScopeFilter();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const {
    assigneeTasks,
    setAssigneeTasks,
    tasksLoading,
    setTasksLoading,
    tasksError,
    setTasksError,
    totalCount,
    setTotalCount,
    memberTaskCounts,
    memberTaskCountsDate,
    fetchAssigneeTasks,
    refreshMemberTaskCounts,
  } = useMemberTaskFetcher({
    currentWorkspaceId,
    selectedAssigneeId,
    mode,
    taskScope,
    pastFromDate,
    pastToDate,
    pastSort,
    statusFilterIds,
    projectFilterIds,
    search,
    pageIndex,
    pageSize: PAGE_SIZE,
    fetchAssigneeTaskCounts,
  });

  const projectOptions = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  );
  useEffect(() => {
    if (!selectedTaskId) return;
    if (!assigneeTasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [assigneeTasks, selectedTaskId]);

  const displayTaskRows = useDisplayTaskRows(assigneeTasks, taskScope);

  const visibleTaskIds = useMemo(
    () => displayTaskRows.flatMap((row) => row.taskIds),
    [displayTaskRows],
  );

  const {
    selectedTaskIds,
    setSelectedTaskIds,
    allVisibleSelected,
    someVisibleSelected,
    selectedCount,
    handleToggleAll,
    handleToggleTask,
    handleDeleteSelected,
  } = useMemberTaskSelection({
    visibleTaskIds,
    deleteTasks,
    tasksLoading,
    setTasksLoading,
    setTasksError,
    setAssigneeTasks,
    setTotalCount,
    refreshMemberTaskCounts,
  });

  useEffect(() => {
    setSelectedTaskIds(new Set());
  }, [selectedAssigneeId, pageIndex, projectFilterIds, search, statusFilterIds, taskScope, pastFromDate, pastToDate, pastSort, setSelectedTaskIds]);

  useEffect(() => {
    if (!currentWorkspaceId || visibleTaskIds.length === 0) {
      return;
    }

    void refreshTaskCommentCounts(currentWorkspaceId, visibleTaskIds);
  }, [currentWorkspaceId, refreshTaskCommentCounts, visibleTaskIds]);

  useEffect(() => {
    if (!currentWorkspaceId || !selectedTaskId) {
      return;
    }

    void refreshTaskCommentCounts(currentWorkspaceId, [selectedTaskId]);
  }, [currentWorkspaceId, refreshTaskCommentCounts, selectedTaskId]);

  const details = useMemberTaskDetails({
    currentWorkspaceId,
    selectedTaskId,
    setSelectedTaskId,
    selectedAssigneeId,
    assigneeTasks,
    projects,
    tagById,
    taskCommentCounts,
  });

  const totalPages = taskScope === 'past'
    ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    : 1;
  const displayTotalCount = taskScope === 'current'
    ? countTaskUnits(assigneeTasks)
    : totalCount;

  const {
    statusFilterLabel,
    projectFilterLabel,
    handleToggleStatus,
    handleToggleProject,
    setStatusPreset,
  } = useMemberTaskFilterToggles({
    statuses,
    statusFilterIds,
    setStatusFilterIds,
    projectFilterIds,
    setProjectFilterIds,
    setPageIndex,
  });

  const panelProps: Omit<MemberTasksPanelProps, 'selectedAssignee'> = {
    taskScope,
    onChangeTaskScope: (scope) => {
      setTaskScope(scope);
      setPageIndex(1);
    },
    memberTaskCountsDate,
    search,
    onSearchChange: (value) => {
      setSearch(value);
      setPageIndex(1);
    },
    statusFilterLabel,
    setStatusPreset,
    statuses,
    statusFilterIds,
    onToggleStatus: handleToggleStatus,
    projectFilterLabel,
    projectOptions,
    projectFilterIds,
    onToggleProject: handleToggleProject,
    pastFromDate,
    onPastFromDateChange: (value) => {
      setPastFromDate(value);
      setPageIndex(1);
    },
    pastToDate,
    onPastToDateChange: (value) => {
      setPastToDate(value);
      setPageIndex(1);
    },
    pastSort,
    onPastSortChange: (value) => {
      setPastSort(value);
      setPageIndex(1);
    },
    onClearFilters: () => {
      setSearch('');
      setStatusFilterIds([]);
      setProjectFilterIds([]);
      setPastFromDate('');
      setPastToDate('');
      setPageIndex(1);
    },
    onRefresh: () => {
      if (selectedAssigneeId) {
        void fetchAssigneeTasks(selectedAssigneeId);
      }
      void refreshMemberTaskCounts();
    },
    selectedAssigneeId,
    tasksLoading,
    selectedCount,
    onDeleteSelected: () => {
      void handleDeleteSelected();
    },
    tasksError,
    displayTaskRows,
    allVisibleSelected,
    someVisibleSelected,
    onToggleAll: handleToggleAll,
    statusById,
    projectById,
    selectedTaskIds,
    onSelectTask: setSelectedTaskId,
    onToggleTask: handleToggleTask,
    taskScopePageSize: PAGE_SIZE,
    displayTotalCount,
    pageIndex,
    totalPages,
    onPrevPage: () => setPageIndex((current) => Math.max(1, current - 1)),
    onNextPage: () => setPageIndex((current) => Math.min(totalPages, current + 1)),
  };

  return {
    panelProps,
    memberTaskCounts,
    memberTaskCountsDate,
    selectedTaskId,
    setSelectedTaskId,
    ...details,
  };
};
