import React, { useMemo } from 'react';
import { t } from '@lingui/macro';
import { Assignee, Filters, GroupMode, Project, Task } from '@/features/planner/types/planner';
import { EMPTY_TIME_OFF_INDEX, timeOffMinLanes, timeOffReservedPeriods, type TimeOffIndex } from '@/features/planner/lib/timeOff';
import type { ReservedPeriod } from '@/features/planner/lib/taskLanes';
import {
  buildTimelineDisplayRows,
  calculateTimelineRowHeights,
  groupTasksByTimelineRow,
  selectArchivedProjectIds,
  selectFilteredTasks,
  selectTimelineGroupItems,
  selectVisibleAssignees,
} from '@/features/planner/lib/timelineSelectors';
import { getTaskPosition, MIN_ROW_HEIGHT, TASK_HEIGHT, TASK_GAP } from '@/features/planner/lib/dateUtils';
import { TaskBar } from '../TaskBar';
import { TimeOffBar } from '../TimeOffBar';
import { resolveAssigneeMinRowHeight } from '../TimelineSidebarRow';

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
  sidebarViewportWidth: number;
  timeOffIndex?: TimeOffIndex;
  myAssigneeIdForTimeOff?: string | null;
  canManageAnyTimeOff?: boolean;
  onOpenTimeOff?: (id: string) => void;
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
  sidebarViewportWidth,
  timeOffIndex = EMPTY_TIME_OFF_INDEX,
  myAssigneeIdForTimeOff = null,
  canManageAnyTimeOff = false,
  onOpenTimeOff,
}: UseTaskDisplayRowsParams) => {
  // Архив прячется только на доске проектов: там у архивного проекта нет строки,
  // поэтому и его задачам показываться негде. В группировке по участникам ничего
  // не скрываем — там задача принадлежит человеку, а не проекту.
  // Отдельный мемо, чтобы раскладка не пересчитывалась на правку цвета проекта.
  const hiddenProjectIds = useMemo(() => {
    if (groupMode !== 'project') return undefined;
    const ids = selectArchivedProjectIds(projects);
    return ids.size > 0 ? ids : undefined;
  }, [groupMode, projects]);

  const filteredTasks = useMemo(
    () => selectFilteredTasks(tasks, filters, assigneeGroupMap, assignees, { hiddenProjectIds }),
    [tasks, filters, assigneeGroupMap, assignees, hiddenProjectIds],
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

  // Rows are people only in assignee grouping; a project row has nobody to be away.
  const reservedLaneZeroByRow = useMemo(() => {
    if (groupMode !== 'assignee') return undefined;
    const reserved: Record<string, ReservedPeriod[]> = {};
    timeOffIndex.byRowId.forEach((records, rowId) => {
      const periods = timeOffReservedPeriods(records);
      if (periods.length > 0) reserved[rowId] = periods;
    });
    return Object.keys(reserved).length > 0 ? reserved : undefined;
  }, [groupMode, timeOffIndex]);

  const tasksByRow = useMemo(
    () => groupTasksByTimelineRow({
      filteredTasks,
      groupItems,
      groupMode,
      reservedLaneZeroByRow,
    }),
    [filteredTasks, groupItems, groupMode, reservedLaneZeroByRow],
  );

  const effectiveMinRowHeight = groupMode === 'assignee'
    ? Math.max(MIN_ROW_HEIGHT, resolveAssigneeMinRowHeight(sidebarViewportWidth))
    : MIN_ROW_HEIGHT;

  // A row carrying a bar needs at least one lane even when it has no tasks; the
  // lanes tasks actually use are already packed around the bar.
  const minLanesByRow = useMemo(() => {
    const minimums: Record<string, number> = {};
    timeOffIndex.byRowId.forEach((records, rowId) => {
      const lanes = timeOffMinLanes(records);
      if (lanes > 0) minimums[rowId] = lanes;
    });
    return minimums;
  }, [timeOffIndex]);

  const rowHeights = useMemo(
    () => calculateTimelineRowHeights(tasksByRow, {
      minRowHeight: effectiveMinRowHeight,
      taskHeight: TASK_HEIGHT,
      taskGap: TASK_GAP,
      minLanesByRow,
    }),
    [tasksByRow, effectiveMinRowHeight, minLanesByRow],
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
      minRowHeight: effectiveMinRowHeight,
      assigneeRowGap: ASSIGNEE_ROW_GAP,
    }),
    [effectiveMinRowHeight, filters.assigneeIds.length, filters.hideUnassigned, groupItems, groupMode, rowHeights, tasksByRow],
  );

  const rowTaskElementsById = useMemo(() => {
    const elementsByRowId = new Map<string, React.ReactNode[]>();
    displayRows.forEach((row) => {
      const rowAssigneeId = groupMode === 'assignee' && row.id !== 'unassigned' ? row.id : null;
      const taskElements: React.ReactNode[] = [];
      const rowTimeOff = rowAssigneeId ? timeOffIndex.byRowId.get(rowAssigneeId) : undefined;
      rowTimeOff?.forEach((record) => {
        const position = getTaskPosition(
          record.startDate,
          record.endDate,
          visibleDays,
          dayWidth,
        );
        if (!position) return;
        taskElements.push(
          <TimeOffBar
            key={record.id}
            record={record}
            position={position}
            dayWidth={dayWidth}
            siblings={rowTimeOff}
            canEditOwn={canManageAnyTimeOff || record.assigneeId === myAssigneeIdForTimeOff}
            onOpenDetail={onOpenTimeOff}
          />,
        );
      });
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
  }, [canEdit, canManageAnyTimeOff, dayWidth, displayRows, groupMode, myAssigneeIdForTimeOff, onOpenTimeOff, timeOffIndex, visibleDays]);

  return { displayRows, rowTaskElementsById };
};
