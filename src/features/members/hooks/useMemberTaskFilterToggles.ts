import type { Dispatch, SetStateAction } from 'react';
import { t } from '@lingui/macro';
import type { Status } from '@/features/planner/types/planner';

interface UseMemberTaskFilterTogglesOptions {
  statuses: Status[];
  statusFilterIds: string[];
  setStatusFilterIds: Dispatch<SetStateAction<string[]>>;
  projectFilterIds: string[];
  setProjectFilterIds: Dispatch<SetStateAction<string[]>>;
  setPageIndex: (page: number) => void;
}

/**
 * Status and project filters of a member's task list: toggling one, the
 * all / open / done presets, and the button labels. Any change goes back to
 * page one.
 */
export const useMemberTaskFilterToggles = ({
  statuses,
  statusFilterIds,
  setStatusFilterIds,
  projectFilterIds,
  setProjectFilterIds,
  setPageIndex,
}: UseMemberTaskFilterTogglesOptions) => {
  const statusFilterLabel = statusFilterIds.length === 0
    ? t`All statuses`
    : t`${statusFilterIds.length} selected`;

  const projectFilterLabel = projectFilterIds.length === 0
    ? t`All projects`
    : t`${projectFilterIds.length} selected`;

  const handleToggleStatus = (statusId: string) => {
    setStatusFilterIds((current) => (
      current.includes(statusId)
        ? current.filter((id) => id !== statusId)
        : [...current, statusId]
    ));
    setPageIndex(1);
  };

  const handleToggleProject = (projectId: string) => {
    setProjectFilterIds((current) => (
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    ));
    setPageIndex(1);
  };

  const setStatusPreset = (mode: 'all' | 'open' | 'done') => {
    if (mode === 'all') {
      setStatusFilterIds([]);
      setPageIndex(1);
      return;
    }
    const targetIds = statuses
      .filter((status) => (mode === 'done'
        ? (status.isFinal || status.isCancelled)
        : (!status.isFinal && !status.isCancelled)))
      .map((status) => status.id);
    setStatusFilterIds(targetIds);
    setPageIndex(1);
  };

  return {
    statusFilterLabel,
    projectFilterLabel,
    handleToggleStatus,
    handleToggleProject,
    setStatusPreset,
  };
};
