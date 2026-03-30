import { useState } from 'react';
import {
  DEFAULT_PAST_TASK_SORT,
  type PastTaskSort,
  type TaskScope,
} from '@/shared/domain/taskScope';

/**
 * Shared filter/pagination state used by both ProjectsPage and MembersPage
 * when displaying task lists with scope switching (current / past).
 */
export function useTaskScopeFilter() {
  const [taskScope, setTaskScope] = useState<TaskScope>('current');
  const [pastFromDate, setPastFromDate] = useState('');
  const [pastToDate, setPastToDate] = useState('');
  const [pastSort, setPastSort] = useState<PastTaskSort>(DEFAULT_PAST_TASK_SORT);
  const [pageIndex, setPageIndex] = useState(1);
  const [statusFilterIds, setStatusFilterIds] = useState<string[]>([]);

  return {
    taskScope,
    setTaskScope,
    pastFromDate,
    setPastFromDate,
    pastToDate,
    setPastToDate,
    pastSort,
    setPastSort,
    pageIndex,
    setPageIndex,
    statusFilterIds,
    setStatusFilterIds,
  };
}
