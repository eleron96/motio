import { useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useDisplayTaskRows } from '@/features/planner/hooks/useDisplayTaskRows';
import { useTaskScopeFilter } from '@/features/planner/hooks/useTaskScopeFilter';
import { useProjectTasksQuery } from '@/features/projects/hooks/useProjectTasksQuery';
import type { ProjectsMainPanelProps } from '@/features/projects/components/ProjectsMainPanel';
import type { Assignee } from '@/features/planner/types/planner';

const PAGE_SIZE = 100;

interface UseProjectTasksViewOptions {
  workspaceId: string | null;
  projectId: string | null;
  assigneeById: Map<string, Assignee>;
}

type ProjectTasksPanelProps = Pick<ProjectsMainPanelProps,
  | 'taskScope'
  | 'onChangeTaskScope'
  | 'search'
  | 'onSearchChange'
  | 'statusFilterLabel'
  | 'setStatusPreset'
  | 'statuses'
  | 'statusFilterIds'
  | 'onToggleStatus'
  | 'assigneeFilterLabel'
  | 'assigneeOptions'
  | 'assigneeFilterIds'
  | 'onToggleAssignee'
  | 'onClearFilters'
  | 'onRefreshTasks'
  | 'tasksLoading'
  | 'tasksError'
  | 'displayTaskRows'
  | 'displayTotalCount'
  | 'pageIndex'
  | 'totalPages'
  | 'onPrevPage'
  | 'onNextPage'
>;

/**
 * The task list of the project open on the projects page: scope, search,
 * status and assignee filters, paging and the query behind them.
 * `panelProps` is that part of the main panel's props.
 */
export const useProjectTasksView = ({ workspaceId, projectId, assigneeById }: UseProjectTasksViewOptions) => {
  const { assignees, statuses } = usePlannerStore(useShallow((state) => ({
    assignees: state.assignees,
    statuses: state.statuses,
  })));
  const [search, setSearch] = useState('');
  const [assigneeFilterIds, setAssigneeFilterIds] = useState<string[]>([]);
  const {
    taskScope, setTaskScope,
    pastFromDate, setPastFromDate,
    pastToDate, setPastToDate,
    pastSort,
    pageIndex, setPageIndex,
    statusFilterIds, setStatusFilterIds,
  } = useTaskScopeFilter();

  useEffect(() => {
    setPageIndex(1);
  }, [projectId, setPageIndex]);

  const {
    projectTasks,
    totalCount,
    availableAssigneeIds,
    tasksLoading,
    tasksError,
    refetchTasks,
  } = useProjectTasksQuery({
    workspaceId,
    projectId,
    taskScope,
    pastFromDate,
    pastToDate,
    pastSort,
    statusFilterIds,
    assigneeFilterIds,
    search,
    pageIndex,
    pageSize: PAGE_SIZE,
  });

  const projectAssigneeIds = useMemo(
    () => new Set<string>([...availableAssigneeIds, ...assigneeFilterIds]),
    [assigneeFilterIds, availableAssigneeIds],
  );

  const assigneeOptions = useMemo(
    () => assignees
      .filter((assignee) => projectAssigneeIds.has(assignee.id))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [assignees, projectAssigneeIds],
  );

  // Fallback list: derive members from the assignees actually used on this
  // project's tasks. The project_members table is the authoritative source;
  // this list is shown in the legacy mobile UI which doesn't load that table.
  const projectMembers = useMemo(() => (
    Array.from(availableAssigneeIds)
      .map((id) => assigneeById.get(id))
      .filter((assignee): assignee is Assignee => Boolean(assignee))
  ), [assigneeById, availableAssigneeIds]);

  const displayTaskRows = useDisplayTaskRows(projectTasks, taskScope);

  const totalPages = taskScope === 'past'
    ? Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    : 1;
  const displayTotalCount = taskScope === 'current'
    ? displayTaskRows.length
    : totalCount;

  const statusFilterLabel = statusFilterIds.length === 0
    ? t`All statuses`
    : t`${statusFilterIds.length} selected`;

  const assigneeFilterLabel = assigneeFilterIds.length === 0
    ? t`All assignees`
    : t`${assigneeFilterIds.length} selected`;

  const handleToggleStatus = (statusId: string) => {
    setPageIndex(1);
    setStatusFilterIds((current) => (
      current.includes(statusId)
        ? current.filter((id) => id !== statusId)
        : [...current, statusId]
    ));
  };

  const handleToggleAssignee = (assigneeId: string) => {
    setPageIndex(1);
    setAssigneeFilterIds((current) => (
      current.includes(assigneeId)
        ? current.filter((id) => id !== assigneeId)
        : [...current, assigneeId]
    ));
  };

  const setStatusPreset = (mode: 'all' | 'open' | 'done') => {
    setPageIndex(1);
    if (mode === 'all') {
      setStatusFilterIds([]);
      return;
    }
    const targetIds = statuses
      .filter((status) => (mode === 'done'
        ? (status.isFinal || status.isCancelled)
        : (!status.isFinal && !status.isCancelled)))
      .map((status) => status.id);
    setStatusFilterIds(targetIds);
  };

  const panelProps: ProjectTasksPanelProps = {
    taskScope,
    onChangeTaskScope: (scope) => {
      setTaskScope(scope);
      setPageIndex(1);
    },
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
    assigneeFilterLabel,
    assigneeOptions,
    assigneeFilterIds,
    onToggleAssignee: handleToggleAssignee,
    onClearFilters: () => {
      setSearch('');
      setStatusFilterIds([]);
      setAssigneeFilterIds([]);
      setPastFromDate('');
      setPastToDate('');
      setPageIndex(1);
    },
    onRefreshTasks: () => {
      if (projectId) {
        void refetchTasks();
      }
    },
    tasksLoading,
    tasksError,
    displayTaskRows,
    displayTotalCount,
    pageIndex,
    totalPages,
    onPrevPage: () => setPageIndex((current) => Math.max(1, current - 1)),
    onNextPage: () => setPageIndex((current) => Math.min(totalPages, current + 1)),
  };

  return {
    projectTasks,
    displayTaskRows,
    projectMembers,
    refetchTasks,
    panelProps,
  };
};
