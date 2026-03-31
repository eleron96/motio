import React, { useMemo } from 'react';
import { t } from '@lingui/macro';
import { Assignee, Filters, GroupMode, Project, Task } from '@/features/planner/types/planner';
import {
  buildTimelineDisplayRows,
  calculateTimelineRowHeights,
  groupTasksByTimelineRow,
  selectFilteredTasks,
  selectTimelineGroupItems,
  selectVisibleAssignees,
} from '@/features/planner/lib/timelineSelectors';
import { getTaskPosition, MIN_ROW_HEIGHT, TASK_HEIGHT, TASK_GAP } from '@/features/planner/lib/dateUtils';
import { TaskBar } from '../TaskBar';

const ASSIGNEE_ROW_GAP = 20;

interface UseTaskDisplayRowsParams {
  tasks: Task[];
  filters: Filters;
  assignees: Assignee[];
  activeFilteredAssignees: Assignee[];
  projects: Project[];
  groupMode: GroupMode;
  myAssigneeId: string | null;
  assigneeGroupMap: Map<string, string>;
  visibleDays: Date[];
  dayWidth: number;
  canEdit: boolean;
}

export const useTaskDisplayRows = ({
  tasks,
  filters,
  assignees,
  activeFilteredAssignees,
  projects,
  groupMode,
  myAssigneeId,
  assigneeGroupMap,
  visibleDays,
  dayWidth,
  canEdit,
}: UseTaskDisplayRowsParams) => {
  const filteredTasks = useMemo(
    () => selectFilteredTasks(tasks, filters, assigneeGroupMap, assignees),
    [tasks, filters, assigneeGroupMap, assignees],
  );

  const visibleAssignees = useMemo(
    () => selectVisibleAssignees({
      groupMode,
      filteredAssignees: activeFilteredAssignees,
      filters,
      assigneeGroupMap,
    }),
    [activeFilteredAssignees, assigneeGroupMap, filters, groupMode],
  );

  const groupItems = useMemo(
    () => selectTimelineGroupItems({
      groupMode,
      visibleAssignees,
      projects,
      myAssigneeId,
    }),
    [groupMode, visibleAssignees, projects, myAssigneeId],
  );

  const tasksByRow = useMemo(
    () => groupTasksByTimelineRow({
      filteredTasks,
      groupItems,
      groupMode,
    }),
    [filteredTasks, groupItems, groupMode],
  );

  const rowHeights = useMemo(
    () => calculateTimelineRowHeights(tasksByRow, {
      minRowHeight: MIN_ROW_HEIGHT,
      taskHeight: TASK_HEIGHT,
      taskGap: TASK_GAP,
    }),
    [tasksByRow],
  );

  const displayRows = useMemo(
    () => buildTimelineDisplayRows({
      groupItems,
      tasksByRow,
      rowHeights,
      groupMode,
      assigneeFilterCount: filters.assigneeIds.length,
      hideUnassigned: filters.hideUnassigned,
      labels: {
        unassigned: t`Unassigned`,
        noProject: t`No project`,
      },
      minRowHeight: MIN_ROW_HEIGHT,
      assigneeRowGap: ASSIGNEE_ROW_GAP,
    }),
    [filters.assigneeIds.length, filters.hideUnassigned, groupItems, groupMode, rowHeights, tasksByRow],
  );

  const rowTaskElementsById = useMemo(() => {
    const elementsByRowId = new Map<string, React.ReactNode[]>();
    displayRows.forEach((row) => {
      const rowAssigneeId = groupMode === 'assignee' && row.id !== 'unassigned' ? row.id : null;
      const taskElements: React.ReactNode[] = [];
      row.tasks.forEach((task) => {
        const position = getTaskPosition(
          task.startDate,
          task.endDate,
          visibleDays,
          dayWidth,
        );
        if (!position) return;
        taskElements.push(
          <TaskBar
            key={task.id}
            task={task}
            position={position}
            dayWidth={dayWidth}
            visibleDays={visibleDays}
            lane={task.lane}
            canEdit={canEdit}
            rowAssigneeId={rowAssigneeId}
          />,
        );
      });
      elementsByRowId.set(row.id, taskElements);
    });
    return elementsByRowId;
  }, [canEdit, dayWidth, displayRows, groupMode, visibleDays]);

  return { displayRows, rowTaskElementsById };
};
