import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useAppBasePath } from '@/features/demo/hooks/useIsDemo';
import { pickNearestRepeatTaskFromToday } from '@/features/planner/hooks/useDisplayTaskRows';
import { hasRichTags, sanitizeTaskDescription } from '@/shared/domain/taskDescription';
import type { Project, Tag, Task, TaskSubtask } from '@/features/planner/types/planner';

interface UseMemberTaskDetailsOptions {
  currentWorkspaceId: string | null;
  selectedTaskId: string | null;
  setSelectedTaskId: (taskId: string | null) => void;
  selectedAssigneeId: string | null;
  assigneeTasks: Task[];
  projects: Project[];
  tagById: Map<string, Tag>;
  taskCommentCounts: Record<string, number>;
}

/**
 * The task open in the member page's details dialog: its project, tags,
 * description and subtasks, and the jump to it on the timeline.
 */
export const useMemberTaskDetails = ({
  currentWorkspaceId,
  selectedTaskId,
  setSelectedTaskId,
  selectedAssigneeId,
  assigneeTasks,
  projects,
  tagById,
  taskCommentCounts,
}: UseMemberTaskDetailsOptions) => {
  const {
    fetchTaskSubtasks,
    setHighlightedTaskTarget,
    setPlannerSelectedTaskId,
    setGroupMode,
    setViewMode,
    setCurrentDate,
    requestScrollToDate,
    clearFilters,
  } = usePlannerStore(useShallow((state) => ({
    fetchTaskSubtasks: state.fetchTaskSubtasks,
    setHighlightedTaskTarget: state.setHighlightedTaskTarget,
    setPlannerSelectedTaskId: state.setSelectedTaskId,
    setGroupMode: state.setGroupMode,
    setViewMode: state.setViewMode,
    setCurrentDate: state.setCurrentDate,
    requestScrollToDate: state.requestScrollToDate,
    clearFilters: state.clearFilters,
  })));
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const basePath = useAppBasePath();
  // Subtasks of the task open in the details dialog; `undefined` = loading.
  const [selectedTaskSubtasks, setSelectedTaskSubtasks] = useState<TaskSubtask[] | undefined>(undefined);

  // The details dialog shows the task's subtasks read-only. They are not part
  // of the assignee task rows, so fetch them for the open task only; a stale
  // response for a task that is no longer open is dropped.
  useEffect(() => {
    setSelectedTaskSubtasks(undefined);
    if (!currentWorkspaceId || !selectedTaskId) return;
    let active = true;
    void fetchTaskSubtasks(currentWorkspaceId, selectedTaskId).then((result) => {
      if (!active) return;
      setSelectedTaskSubtasks(result.error ? [] : result.subtasks);
    });
    return () => {
      active = false;
    };
  }, [currentWorkspaceId, fetchTaskSubtasks, selectedTaskId]);

  const selectedTask = useMemo(
    () => assigneeTasks.find((task) => task.id === selectedTaskId) ?? null,
    [assigneeTasks, selectedTaskId],
  );
  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === selectedTask?.projectId) ?? null,
    [projects, selectedTask?.projectId],
  );
  const selectedTaskTags = useMemo(() => (
    selectedTask?.tagIds
      .map((tagId) => tagById.get(tagId))
      .filter((tag): tag is NonNullable<typeof tag> => tag != null) ?? []
  ), [selectedTask?.tagIds, tagById]);
  const selectedTaskDescription = useMemo(() => {
    if (!selectedTask?.description) return '';
    if (!hasRichTags(selectedTask.description)) return selectedTask.description;
    return sanitizeTaskDescription(selectedTask.description);
  }, [selectedTask?.description]);
  const selectedTaskCommentCount = selectedTask ? taskCommentCounts[selectedTask.id] : undefined;

  const handleOpenTaskInTimeline = useCallback(() => {
    if (!selectedTask || !selectedAssigneeId) return;
    const timelineTask = pickNearestRepeatTaskFromToday(selectedTask, assigneeTasks);
    setPlannerSelectedTaskId(null);
    setHighlightedTaskTarget(timelineTask.id, selectedAssigneeId);
    clearFilters();
    if (user?.id && typeof window !== 'undefined') {
      window.localStorage.removeItem(`planner-filters-${user.id}`);
    }
    setGroupMode('assignee');
    setViewMode('day');
    setCurrentDate(timelineTask.startDate);
    requestScrollToDate(timelineTask.startDate);
    setSelectedTaskId(null);
    navigate(basePath);
  }, [
    basePath,
    assigneeTasks,
    clearFilters,
    navigate,
    requestScrollToDate,
    selectedAssigneeId,
    selectedTask,
    setGroupMode,
    setHighlightedTaskTarget,
    setPlannerSelectedTaskId,
    setCurrentDate,
    setSelectedTaskId,
    setViewMode,
    user?.id,
  ]);

  return {
    selectedTaskSubtasks,
    selectedTask,
    selectedTaskProject,
    selectedTaskTags,
    selectedTaskDescription,
    selectedTaskCommentCount,
    handleOpenTaskInTimeline,
  };
};
