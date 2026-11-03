import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useAppBasePath } from '@/features/demo/hooks/useIsDemo';
import { needsAssigneeGroupingToRevealTask } from '@/shared/domain/timelineTaskReveal';
import type { Task } from '@/features/planner/types/planner';

interface UseOpenProjectTaskInTimelineOptions {
  selectedTask: Task | null;
  setSelectedTaskId: (taskId: string | null) => void;
}

/**
 * "Go to task" from the projects page: back to the timeline, in the day view,
 * on the task's start date, with the task highlighted. Filters that could hide
 * it are cleared, and the grouping switches to people when the task would not
 * show under the current one.
 */
export const useOpenProjectTaskInTimeline = ({ selectedTask, setSelectedTaskId }: UseOpenProjectTaskInTimelineOptions) => {
  const {
    projects,
    assignees,
    groupMode,
    setGroupMode,
    setHighlightedTaskId,
    setViewMode,
    setCurrentDate,
    requestScrollToDate,
    clearFilters,
  } = usePlannerStore(useShallow((state) => ({
    projects: state.projects,
    assignees: state.assignees,
    groupMode: state.groupMode,
    setGroupMode: state.setGroupMode,
    setHighlightedTaskId: state.setHighlightedTaskId,
    setViewMode: state.setViewMode,
    setCurrentDate: state.setCurrentDate,
    requestScrollToDate: state.requestScrollToDate,
    clearFilters: state.clearFilters,
  })));
  const userId = useAuthStore((state) => state.user?.id);
  const navigate = useNavigate();
  const basePath = useAppBasePath();

  return useCallback(() => {
    if (!selectedTask) return;
    setHighlightedTaskId(selectedTask.id);
    clearFilters();
    if (userId && typeof window !== 'undefined') {
      window.localStorage.removeItem(`planner-filters-${userId}`);
    }
    if (needsAssigneeGroupingToRevealTask({ task: selectedTask, projects, assignees, groupMode })) {
      setGroupMode('assignee');
    }
    setViewMode('day');
    setCurrentDate(selectedTask.startDate);
    requestScrollToDate(selectedTask.startDate);
    setSelectedTaskId(null);
    navigate(basePath);
  }, [
    basePath,
    assignees,
    clearFilters,
    groupMode,
    navigate,
    projects,
    requestScrollToDate,
    selectedTask,
    setGroupMode,
    setHighlightedTaskId,
    setCurrentDate,
    setSelectedTaskId,
    setViewMode,
    userId,
  ]);
};
