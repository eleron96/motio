import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { addYears, format, parseISO } from 'date-fns';
import { Task } from '@/features/planner/types/planner';
import { TaskScope, PastTaskSort } from '@/shared/domain/taskScope';
import { fetchAssigneeTasks as fetchAssigneeTasksFromApi } from '@/infrastructure/members/memberTasksRepository';
import { createLatestAsyncRequest } from '@/shared/lib/latestAsyncRequest';
import { countTaskUnits } from '@/features/planner/hooks/useDisplayTaskRows';

interface UseMemberTaskFetcherParams {
  currentWorkspaceId: string | null;
  selectedAssigneeId: string | null;
  mode: 'tasks' | 'access' | 'groups';
  taskScope: TaskScope;
  pastFromDate: string;
  pastToDate: string;
  pastSort: PastTaskSort;
  statusFilterIds: string[];
  projectFilterIds: string[];
  search: string;
  pageIndex: number;
  pageSize: number;
  fetchAssigneeTaskCounts: (params: {
    workspaceId: string;
    startDate: string;
    endDate: string;
  }) => Promise<{ counts: Record<string, number>; date: string; error?: string }>;
}

interface UseMemberTaskFetcherResult {
  assigneeTasks: Task[];
  setAssigneeTasks: Dispatch<SetStateAction<Task[]>>;
  tasksLoading: boolean;
  setTasksLoading: Dispatch<SetStateAction<boolean>>;
  tasksError: string;
  setTasksError: Dispatch<SetStateAction<string>>;
  totalCount: number;
  setTotalCount: Dispatch<SetStateAction<number>>;
  memberTaskCounts: Record<string, number>;
  memberTaskCountsDate: string | null;
  fetchAssigneeTasks: (assigneeId: string) => Promise<void>;
  refreshMemberTaskCounts: () => Promise<void>;
}

export const useMemberTaskFetcher = ({
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
  pageSize,
  fetchAssigneeTaskCounts,
}: UseMemberTaskFetcherParams): UseMemberTaskFetcherResult => {
  const [assigneeTasks, setAssigneeTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [memberTaskCounts, setMemberTaskCounts] = useState<Record<string, number>>({});
  const [memberTaskCountsDate, setMemberTaskCountsDate] = useState<string | null>(null);
  const assigneeTasksRequestRef = useRef(createLatestAsyncRequest());

  useEffect(() => {
    const taskRequest = assigneeTasksRequestRef.current;
    return () => {
      taskRequest.cancel();
    };
  }, []);

  useEffect(() => {
    if (currentWorkspaceId) return;
    setMemberTaskCounts({});
    setMemberTaskCountsDate(null);
  }, [currentWorkspaceId]);

  const refreshMemberTaskCounts = useCallback(async () => {
    if (!currentWorkspaceId) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const countsEnd = format(addYears(parseISO(today), 10), 'yyyy-MM-dd');
    const result = await fetchAssigneeTaskCounts({
      workspaceId: currentWorkspaceId,
      startDate: today,
      endDate: countsEnd,
    });
    if (result.error) {
      console.error(result.error);
      return;
    }
    setMemberTaskCounts(result.counts);
    setMemberTaskCountsDate(result.date);
  }, [currentWorkspaceId, fetchAssigneeTaskCounts]);

  useEffect(() => {
    if (mode !== 'tasks' || !currentWorkspaceId) return;
    void refreshMemberTaskCounts();
  }, [currentWorkspaceId, mode, refreshMemberTaskCounts]);

  const fetchAssigneeTasks = useCallback(async (assigneeId: string) => {
    if (!currentWorkspaceId) return;
    const request = assigneeTasksRequestRef.current.next();
    setTasksLoading(true);
    setTasksError('');
    try {
      const result = await fetchAssigneeTasksFromApi({
        workspaceId: currentWorkspaceId,
        assigneeId,
        taskScope,
        pastFromDate,
        pastToDate,
        pastSort,
        statusFilterIds,
        projectFilterIds,
        search,
        pageIndex,
        pageSize,
        signal: request.signal,
      });

      if (!assigneeTasksRequestRef.current.isCurrent(request.requestId)) {
        return;
      }
      if (!result) {
        setTasksLoading(false);
        return;
      }

      const mapped = result.tasks;
      setAssigneeTasks(mapped);
      setTotalCount(result.totalCount);
      if (
        taskScope === 'current'
        && statusFilterIds.length === 0
        && projectFilterIds.length === 0
        && !search.trim()
      ) {
        setMemberTaskCounts((current) => ({
          ...current,
          [assigneeId]: countTaskUnits(mapped),
        }));
        if (!memberTaskCountsDate) {
          setMemberTaskCountsDate(format(new Date(), 'yyyy-MM-dd'));
        }
      }
      setTasksLoading(false);
    } catch (error) {
      if (!assigneeTasksRequestRef.current.isCurrent(request.requestId)) {
        return;
      }
      const message = error instanceof Error ? error.message : t`Failed to load tasks.`;
      setTasksError(message);
      setTasksLoading(false);
    }
  }, [currentWorkspaceId, memberTaskCountsDate, pageIndex, pageSize, projectFilterIds, search, statusFilterIds, taskScope, pastFromDate, pastToDate, pastSort]);

  useEffect(() => {
    if (!selectedAssigneeId) {
      assigneeTasksRequestRef.current.cancel();
      setTasksLoading(false);
      setTasksError('');
      setAssigneeTasks([]);
      setTotalCount(0);
      return;
    }
    void fetchAssigneeTasks(selectedAssigneeId);
  }, [fetchAssigneeTasks, selectedAssigneeId]);

  return {
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
  };
};
