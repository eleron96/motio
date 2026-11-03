import { useCallback, type MutableRefObject } from 'react';
import type { Assignee, GroupMode, Project } from '@/features/planner/types/planner';

export interface TimelineNewTaskDefaults {
  startDate: string;
  endDate: string;
  projectId?: string | null;
  assigneeIds?: string[];
}

interface UseCreateTaskAtOptions {
  groupMode: GroupMode;
  projects: Project[];
  assignees: Assignee[];
  /** When the last drag-scroll ended: a double-click right after one is not meant. */
  lastDragTimeRef: MutableRefObject<number>;
  onCreateTask?: (payload: TimelineNewTaskDefaults) => void;
}

/**
 * A double-click on a day of a row opens a new task for that day, already
 * filled in with the row's project or person.
 */
export const useCreateTaskAt = ({
  groupMode,
  projects,
  assignees,
  lastDragTimeRef,
  onCreateTask,
}: UseCreateTaskAtOptions) => useCallback((date: string, rowId: string) => {
  // Viewers may open the dialog too — it opens in time-off-only mode for them.
  if (Date.now() - lastDragTimeRef.current < 200) return;
  const defaults: TimelineNewTaskDefaults = {
    startDate: date,
    endDate: date,
    assigneeIds: [],
  };

  if (groupMode === 'project') {
    if (rowId === 'unassigned') {
      defaults.projectId = null;
    } else {
      const project = projects.find((item) => item.id === rowId);
      defaults.projectId = project && !project.archived ? project.id : null;
    }
  }

  if (groupMode === 'assignee' && rowId !== 'unassigned') {
    const assignee = assignees.find((item) => item.id === rowId);
    if (assignee?.isActive) {
      defaults.assigneeIds = [assignee.id];
    }
  }

  onCreateTask?.(defaults);
}, [assignees, groupMode, lastDragTimeRef, onCreateTask, projects]);
