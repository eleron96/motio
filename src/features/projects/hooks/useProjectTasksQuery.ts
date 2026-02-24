import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { t } from '@lingui/macro';
import { Task } from '@/features/planner/types/planner';
import { fetchProjectTasks } from '@/infrastructure/projects/projectTasksRepository';

type UseProjectTasksQueryParams = {
  workspaceId: string | null;
  projectId: string | null;
};

export const useProjectTasksQuery = ({
  workspaceId,
  projectId,
}: UseProjectTasksQueryParams) => {
  const query = useQuery({
    queryKey: ['projectTasks', workspaceId, projectId],
    enabled: Boolean(workspaceId && projectId),
    queryFn: async ({ signal }) => {
      if (!workspaceId || !projectId) return [];
      return fetchProjectTasks({
        workspaceId,
        projectId,
        signal,
      });
    },
    staleTime: 30_000,
  });

  const projectTasks = useMemo<Task[]>(
    () => query.data ?? [],
    [query.data],
  );
  const tasksLoading = query.isFetching;
  const tasksError = query.isError
    ? (query.error instanceof Error ? query.error.message : t`Failed to load tasks.`)
    : '';

  return {
    projectTasks,
    tasksLoading,
    tasksError,
    refetchTasks: query.refetch,
  };
};
