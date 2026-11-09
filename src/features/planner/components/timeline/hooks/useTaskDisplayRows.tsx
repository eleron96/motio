import React, { useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { t } from '@lingui/macro';
import { Assignee, Filters, GroupMode, Project, Task } from '@/features/planner/types/planner';
import { EMPTY_TIME_OFF_INDEX, timeOffMinLanes, timeOffReservedPeriods, type TimeOffIndex } from '@/features/planner/lib/timeOff';
import type { RememberedLane, ReservedPeriod } from '@/features/planner/lib/taskLanes';
import {
  buildTimelineDisplayRows,
  calculateTimelineRowHeights,
  groupTasksByTimelineRow,
  selectArchivedProjectIds,
  selectFilteredTasks,
  selectTimelineGroupItems,
  selectVisibleAssignees,
} from '@/features/planner/lib/timelineSelectors';
import { getTaskPosition } from '@/features/planner/lib/dateUtils';
import { useTimelineGeometry } from '@/features/planner/hooks/useTimelineGeometry';
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
  /**
   * What the layout belongs to (workspace, view). While it, the grouping and
   * the filters stay the same, bars keep their lanes and rows do not shrink.
   */
  layoutScope?: string;
}

type LayoutMemory = {
  key: string;
  lanesByRow: Map<string, Map<string, RememberedLane>>;
  heights: Record<string, number>;
};

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
  layoutScope = '',
}: UseTaskDisplayRowsParams) => {
  // Lanes and row heights are laid out from the tasks of the days the timeline
  // renders, not from everything loaded: loading the next stretch of dates
  // while the timeline is scrolled far (planTaskWindowLoad) then changes
  // nothing on screen.
  const rangeStart = visibleDays.length > 0 ? format(visibleDays[0], 'yyyy-MM-dd') : '';
  const rangeEnd = visibleDays.length > 0 ? format(visibleDays[visibleDays.length - 1], 'yyyy-MM-dd') : '';
  // The same tasks in range keep the same array: a load that changed only
  // dates off screen then re-renders none of the rows (each row redraws all
  // its day cells when its bars array changes).
  const lastRangeTasksRef = useRef<Task[]>([]);
  const rangeTasks = useMemo(() => {
    const inRange = rangeStart && rangeEnd
      ? tasks.filter((task) => task.endDate >= rangeStart && task.startDate <= rangeEnd)
      : tasks;
    // Compared as sets: a window load returns the rows in no particular order.
    const last = lastRangeTasksRef.current;
    if (last.length === inRange.length) {
      const lastSet = new Set(last);
      if (inRange.every((task) => lastSet.has(task))) return last;
    }
    lastRangeTasksRef.current = inRange;
    return inRange;
  }, [rangeEnd, rangeStart, tasks]);

  // The last layout, kept while the scope, the grouping and the filters stay:
  // bars keep their lanes (calculateTaskLanes) and rows only grow. Scrolling
  // brings other tasks into the laid out range; repacking from scratch and
  // fitting rows to them made the rows on screen jump at every step.
  // Read inside the layout memos rather than listed as their dependency: the
  // memory changes after every layout, and depending on it would redo the
  // layout on every render (each scroll step re-renders the grid).
  // Bar and row sizes: the usual ones unless the workspace picked a denser
  // timeline (server setting timeline.density; computers only).
  const geometry = useTimelineGeometry();
  // A density change lays the rows out afresh (rows never shrink within a layout).
  const layoutKey = `${layoutScope}|${groupMode}|${JSON.stringify(filters)}|${geometry.taskHeight}:${geometry.tieredAvatars}`;
  const layoutMemoryRef = useRef<LayoutMemory>({ key: '', lanesByRow: new Map(), heights: {} });
  const readLayoutMemory = () => (
    layoutMemoryRef.current.key === layoutKey ? layoutMemoryRef.current : null
  );

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
    () => selectFilteredTasks(rangeTasks, filters, assigneeGroupMap, assignees, { hiddenProjectIds }),
    [rangeTasks, filters, assigneeGroupMap, assignees, hiddenProjectIds],
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
      previousLanesByRow: readLayoutMemory()?.lanesByRow,
      // Not a dependency either: the range alone changing (a scroll step)
      // must not redo the layout; it is read when the tasks change anyway.
      layoutRange: rangeStart && rangeEnd ? { startDate: rangeStart, endDate: rangeEnd } : undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the memory is read, not tracked (see above)
    [filteredTasks, groupItems, groupMode, reservedLaneZeroByRow, layoutKey],
  );

  const effectiveMinRowHeight = groupMode === 'assignee' && geometry.tieredAvatars
    ? Math.max(geometry.minRowHeight, resolveAssigneeMinRowHeight(sidebarViewportWidth))
    : geometry.minRowHeight;

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

  const rowHeights = useMemo(() => {
    const heights = calculateTimelineRowHeights(tasksByRow, {
      minRowHeight: effectiveMinRowHeight,
      taskHeight: geometry.taskHeight,
      taskGap: geometry.taskGap,
      minLanesByRow,
      rowTopPadding: geometry.rowTopPadding,
      rowBottomSpace: geometry.rowBottomSpace,
    });
    const previousHeights = readLayoutMemory()?.heights;
    if (!previousHeights) return heights;
    Object.keys(heights).forEach((rowId) => {
      const previous = previousHeights[rowId];
      if (previous !== undefined && previous > heights[rowId]) heights[rowId] = previous;
    });
    return heights;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the memory is read, not tracked (see above)
  }, [tasksByRow, effectiveMinRowHeight, minLanesByRow, layoutKey, geometry]);

  useEffect(() => {
    const lanesByRow = new Map<string, Map<string, RememberedLane>>();
    Object.entries(tasksByRow).forEach(([rowId, rowTasks]) => {
      if (rowTasks.length === 0) return;
      lanesByRow.set(rowId, new Map(rowTasks.map((task) => [task.id, task])));
    });
    layoutMemoryRef.current = { key: layoutKey, lanesByRow, heights: rowHeights };
  }, [layoutKey, rowHeights, tasksByRow]);

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
            geometry={geometry}
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
            geometry={geometry}
          />,
        );
      });
      elementsByRowId.set(row.id, taskElements);
    });
    return elementsByRowId;
  }, [canEdit, canManageAnyTimeOff, dayWidth, displayRows, groupMode, geometry, myAssigneeIdForTimeOff, onOpenTimeOff, timeOffIndex, visibleDays]);

  return { displayRows, rowTaskElementsById, geometry };
};
