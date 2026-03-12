import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { t } from '@lingui/macro';
import { Task } from '@/features/planner/types/planner';
import { fetchProjectTasks } from '@/infrastructure/projects/projectTasksRepository';
import type { PastTaskSort, TaskScope } from '@/shared/domain/taskScope';

type UseProjectTasksQueryParams = {
  workspaceId: string | null;
  projectId: string | null;
  taskScope: TaskScope;
  pastFromDate: string;
  pastToDate: string;
  pastSort: PastTaskSort;
  statusFilterIds: string[];
  assigneeFilterIds: string[];
  search: string;
  pageIndex: number;
  pageSize: number;
};

export const useProjectTasksQuery = ({
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
  pageSize,
}: UseProjectTasksQueryParams) => {
  const query = useQuery({
    queryKey: [
      'projectTasks',
      workspaceId,
      projectId,
      taskScope,
      pastFromDate,
      pastToDate,
      pastSort,
      search,
      pageIndex,
      pageSize,
      statusFilterIds,
      assigneeFilterIds,
    ],
    enabled: Boolean(workspaceId && projectId),
    queryFn: async ({ signal }) => {
      if (!workspaceId || !projectId) {
        return {
          tasks: [],
          totalCount: 0,
          availableAssigneeIds: [],
        };
      }
      return fetchProjectTasks({
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
        pageSize,
        signal,
      });
    },
    staleTime: 30_000,
  });

  const projectTasks = useMemo<Task[]>(
    () => query.data?.tasks ?? [],
    [query.data?.tasks],
  );
  const totalCount = query.data?.totalCount ?? 0;
  const availableAssigneeIds = query.data?.availableAssigneeIds ?? [];
  const tasksLoading = query.isFetching;
  const tasksError = query.isError
    ? (query.error instanceof Error ? query.error.message : t`Failed to load tasks.`)
    : '';

  return {
    projectTasks,
    totalCount,
    availableAssigneeIds,
    tasksLoading,
    tasksError,
    refetchTasks: query.refetch,
  };
};
