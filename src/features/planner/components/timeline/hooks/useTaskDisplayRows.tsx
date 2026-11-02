import React, { useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { t } from '@lingui/macro';
import { Assignee, Filters, GroupMode, Project, Task } from '@/features/planner/types/planner';
import { EMPTY_TIME_OFF_INDEX, timeOffMinLanes, timeOffReservedPeriods, type TimeOffIndex } from '@/features/planner/lib/timeOff';
import type { ReservedPeriod } from '@/features/planner/lib/taskLanes';
import {
  buildTimelineDisplayRows,
  groupTasksByTimelineRow,
  selectArchivedProjectIds,
  selectFilteredTasks,
  selectTimelineGroupItems,
  selectVisibleAssignees,
  timelineRowExtraHeight,
} from '@/features/planner/lib/timelineSelectors';
import { getTaskPosition, MIN_ROW_HEIGHT, TASK_HEIGHT, TASK_GAP } from '@/features/planner/lib/dateUtils';
import { TaskBar } from '../TaskBar';
import { TimeOffBar } from '../TimeOffBar';
import { resolveAssigneeMinRowHeight } from '../TimelineSidebarRow';
import { useAdaptiveRowHeights } from './useAdaptiveRowHeights';

const ASSIGNEE_ROW_GAP = 20;

/** Laid out rows before fitting: each takes its minimum height. */
const NO_ROW_HEIGHTS: Record<string, number> = Object.freeze({}) as Record<string, number>;

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
   * the filters stay the same, bars keep their lanes.
   */
  layoutScope?: string;
  /** Horizontal scroll of the date area and its visible width: rows fit the days on screen. */
  scrollLeft?: number;
  viewportWidth?: number;
  /** The day range is shifting: keep the row heights as they are (useAdaptiveRowHeights). */
  holdRowHeights?: boolean;
  /** The timeline's scroll container: its scroll tells movement from rest. */
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  /** Height of the sticky header above the first row. */
  headerHeight?: number;
  /** Rows may grow but not shrink (a drag, the search lens, a deep-link highlight). */
  suspendRowShrink?: boolean;
}

const NO_CONTAINER: React.RefObject<HTMLDivElement> = { current: null };

type LayoutMemory = {
  key: string;
  lanesByRow: Map<string, Map<string, number>>;
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
  scrollLeft = 0,
  viewportWidth = 0,
  holdRowHeights = false,
  scrollContainerRef = NO_CONTAINER,
  headerHeight = 0,
  suspendRowShrink = false,
}: UseTaskDisplayRowsParams) => {
  // Lanes are laid out from the tasks of the days the timeline renders, not
  // from everything loaded: loading the next stretch of dates while the
  // timeline is scrolled far (planTaskWindowLoad) then changes nothing on
  // screen. Row heights then fit the days actually on screen.
  const dayKeys = useMemo(() => visibleDays.map((day) => format(day, 'yyyy-MM-dd')), [visibleDays]);
  const rangeStart = dayKeys[0] ?? '';
  const rangeEnd = dayKeys[dayKeys.length - 1] ?? '';
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
  // bars keep their lanes (calculateTaskLanes). Scrolling brings other tasks
  // into the laid out range; repacking from scratch made the bars on screen
  // hop between lanes at every step.
  // Read inside the layout memo rather than listed as its dependency: the
  // memory changes after every layout, and depending on it would redo the
  // layout on every render (each scroll step re-renders the grid).
  const layoutKey = `${layoutScope}|${groupMode}|${JSON.stringify(filters)}`;
  const layoutMemoryRef = useRef<LayoutMemory>({ key: '', lanesByRow: new Map() });
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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the memory is read, not tracked (see above)
    [filteredTasks, groupItems, groupMode, reservedLaneZeroByRow, layoutKey],
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

  useEffect(() => {
    const lanesByRow = new Map<string, Map<string, number>>();
    Object.entries(tasksByRow).forEach(([rowId, rowTasks]) => {
      if (rowTasks.length === 0) return;
      lanesByRow.set(rowId, new Map(rowTasks.map((task) => [task.id, task.lane])));
    });
    layoutMemoryRef.current = { key: layoutKey, lanesByRow };
  }, [layoutKey, tasksByRow]);

  const rowMetrics = useMemo(
    () => ({ minRowHeight: effectiveMinRowHeight, taskHeight: TASK_HEIGHT, taskGap: TASK_GAP }),
    [effectiveMinRowHeight],
  );

  // The rows to show. Their `height` is only the minimum: the height shown is
  // in rowHeights (useAdaptiveRowHeights), kept apart so that a row changing
  // height does not hand its memoised sidebar cell a new row object.
  const displayRows = useMemo(
    () => buildTimelineDisplayRows({
      groupItems,
      tasksByRow,
      rowHeights: NO_ROW_HEIGHTS,
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
    [effectiveMinRowHeight, filters.assigneeIds.length, filters.hideUnassigned, groupItems, groupMode, tasksByRow],
  );

  const adaptiveRows = useMemo(
    () => displayRows.map((row) => ({
      id: row.id,
      tasks: row.tasks,
      extra: timelineRowExtraHeight(row.id, groupMode, ASSIGNEE_ROW_GAP),
    })),
    [groupMode, displayRows],
  );

  const { heights: rowHeights, instantRowIds, transition: rowHeightTransition } = useAdaptiveRowHeights({
    rows: adaptiveRows,
    dayKeys,
    minLanesByRow,
    metrics: rowMetrics,
    scrollLeft,
    viewportWidth,
    dayWidth,
    epoch: layoutKey,
    hold: holdRowHeights,
    suspended: suspendRowShrink,
    scrollContainerRef,
    headerHeight,
  });

  // Independent of the row heights: a row changing height must not hand every
  // row a new children array (each would redraw its day cells).
  const rowTaskElementsById = useMemo(() => {
    const elementsByRowId = new Map<string, React.ReactNode[]>();
    displayRows.forEach(({ id: rowId, tasks: rowTasks }) => {
      const rowAssigneeId = groupMode === 'assignee' && rowId !== 'unassigned' ? rowId : null;
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
      rowTasks.forEach((task) => {
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
      elementsByRowId.set(rowId, taskElements);
    });
    return elementsByRowId;
  }, [canEdit, canManageAnyTimeOff, dayWidth, displayRows, groupMode, myAssigneeIdForTimeOff, onOpenTimeOff, timeOffIndex, visibleDays]);

  return { displayRows, rowTaskElementsById, rowHeights, instantRowIds, rowHeightTransition };
};
