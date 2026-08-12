import { Assignee, Filters, GroupMode, MemberGroupAssignment, Project, Task } from '@/features/planner/types/planner';
import { ReservedPeriod, TaskWithLane, calculateTaskLanes, getMaxLanes } from '@/features/planner/lib/taskLanes';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';

export type TimelineGroupItem = {
  id: string;
  name: string;
  color: string | undefined;
};

export type TimelineDisplayRow = TimelineGroupItem & {
  tasks: TaskWithLane[];
  height: number;
};

/** Shared empty set so the default path allocates nothing per call. */
const EMPTY_ID_SET: ReadonlySet<string> = new Set<string>();

export const selectArchivedProjectIds = (projects: Project[]): Set<string> => {
  const ids = new Set<string>();
  projects.forEach((project) => {
    if (project.archived) ids.add(project.id);
  });
  return ids;
};

export const buildAssigneeGroupMap = (
  assignees: Assignee[],
  memberGroupAssignments: MemberGroupAssignment[],
) => {
  const groupByUserId = new Map(memberGroupAssignments.map((assignment) => [assignment.userId, assignment.groupId]));
  const map = new Map<string, string>();
  assignees.forEach((assignee) => {
    if (!assignee.userId) return;
    const groupId = groupByUserId.get(assignee.userId);
    if (groupId) {
      map.set(assignee.id, groupId);
    }
  });
  return map;
};

export const resolveCurrentUserAssigneeId = (
  assignees: Assignee[],
  userId: string | null | undefined,
) => {
  if (!userId) return null;
  return assignees.find((assignee) => assignee.userId === userId)?.id ?? null;
};

export const selectFilteredTasks = (
  tasks: Task[],
  filters: Filters,
  assigneeGroupMap: Map<string, string>,
  assignees: Assignee[],
  options: {
    /**
     * Projects whose tasks must not be shown at all. Project grouping passes
     * the archived ones here: an archived project has no row, so its tasks
     * would otherwise be grouped under a row that never renders.
     */
    hiddenProjectIds?: ReadonlySet<string>;
  } = {},
) => {
  const assigneeById = new Map(assignees.map((assignee) => [assignee.id, assignee]));
  const hiddenProjectIds = options.hiddenProjectIds ?? EMPTY_ID_SET;

  return tasks.filter((task) => {
    if (task.assigneeIds.length > 0 && assigneeById.size > 0) {
      const hasVisibleAssignee = task.assigneeIds.some((id) => {
        const assignee = assigneeById.get(id);
        // Не скрываем задачу, если исполнитель неизвестен локальному кэшу.
        return assignee ? assignee.isActive : true;
      });
      if (!hasVisibleAssignee) {
        return false;
      }
    }

    // Задачи без проекта это не касается — паттерн тот же, что у фильтра по
    // проектам ниже: условие начинается с `task.projectId`.
    if (task.projectId && hiddenProjectIds.has(task.projectId)) {
      return false;
    }

    if (filters.projectIds.length > 0 && task.projectId && !filters.projectIds.includes(task.projectId)) {
      return false;
    }

    if (filters.assigneeIds.length > 0) {
      if (!task.assigneeIds.some((id) => filters.assigneeIds.includes(id))) {
        return false;
      }
    } else if (filters.hideUnassigned && task.assigneeIds.length === 0) {
      return false;
    }

    if (filters.statusIds.length > 0 && !filters.statusIds.includes(task.statusId)) {
      return false;
    }
    if (filters.typeIds.length > 0 && !filters.typeIds.includes(task.typeId)) {
      return false;
    }
    if (filters.tagIds.length > 0 && !filters.tagIds.some((id) => task.tagIds.includes(id))) {
      return false;
    }

    if (filters.groupIds.length > 0) {
      const matchesGroup = task.assigneeIds.some((id) => {
        const groupId = assigneeGroupMap.get(id);
        return groupId ? filters.groupIds.includes(groupId) : false;
      });
      if (!matchesGroup) {
        return false;
      }
    }

    return true;
  });
};

export const selectVisibleAssignees = ({
  groupMode,
  filteredAssignees,
  filters,
  assigneeGroupMap,
}: {
  groupMode: GroupMode;
  filteredAssignees: Assignee[];
  filters: Filters;
  assigneeGroupMap: Map<string, string>;
}) => {
  if (groupMode !== 'assignee') return filteredAssignees;
  let list = filteredAssignees;
  if (filters.assigneeIds.length > 0) {
    list = list.filter((assignee) => filters.assigneeIds.includes(assignee.id));
  }
  if (filters.groupIds.length > 0) {
    list = list.filter((assignee) => {
      const groupId = assigneeGroupMap.get(assignee.id);
      return groupId ? filters.groupIds.includes(groupId) : false;
    });
  }
  return list;
};

export const selectTimelineGroupItems = ({
  groupMode,
  visibleAssignees,
  projects,
  myAssigneeId,
}: {
  groupMode: GroupMode;
  visibleAssignees: Assignee[];
  projects: Project[];
  myAssigneeId: string | null;
}): TimelineGroupItem[] => {
  if (groupMode === 'assignee') {
    const sorted = [...visibleAssignees].sort((left, right) => {
      if (myAssigneeId && left.id === myAssigneeId) return -1;
      if (myAssigneeId && right.id === myAssigneeId) return 1;
      return (left.name ?? '').localeCompare(right.name ?? '', undefined, { sensitivity: 'base' });
    });
    return sorted.map((assignee) => ({ id: assignee.id, name: assignee.name, color: undefined }));
  }

  // Архивный проект уезжает в архив на странице «Проекты» и на доске проектов
  // строки не занимает. Задачи при этом никуда не деваются — они по-прежнему
  // видны в группировке по участникам.
  return projects.filter((project) => !project.archived).map((project) => ({
    id: project.id,
    name: formatProjectLabel(project.name, project.code),
    color: project.color,
  }));
};

export const groupTasksByTimelineRow = ({
  filteredTasks,
  groupItems,
  groupMode,
  reservedLaneZeroByRow,
}: {
  filteredTasks: Task[];
  groupItems: TimelineGroupItem[];
  groupMode: GroupMode;
  /**
   * Per row, the periods where lane 0 belongs to a time-off bar. Only assignee
   * grouping passes them — a project row has no person to be away.
   */
  reservedLaneZeroByRow?: Record<string, ReservedPeriod[]>;
}): Record<string, TaskWithLane[]> => {
  const grouped: Record<string, TaskWithLane[]> = {};
  groupItems.forEach((item) => {
    grouped[item.id] = [];
  });
  grouped.unassigned = [];

  const tasksPerGroup: Record<string, Task[]> = {};
  groupItems.forEach((item) => {
    tasksPerGroup[item.id] = [];
  });
  tasksPerGroup.unassigned = [];

  const visibleGroupIds = new Set(groupItems.map((item) => item.id));
  filteredTasks.forEach((task) => {
    if (groupMode === 'assignee') {
      const matchingAssignees = Array.from(new Set(task.assigneeIds)).filter((id) => visibleGroupIds.has(id));
      if (matchingAssignees.length === 0) {
        tasksPerGroup.unassigned.push(task);
        return;
      }
      matchingAssignees.forEach((assigneeId) => {
        if (!tasksPerGroup[assigneeId]) {
          tasksPerGroup[assigneeId] = [];
        }
        tasksPerGroup[assigneeId].push(task);
      });
      return;
    }

    const groupId = task.projectId || 'unassigned';
    if (!tasksPerGroup[groupId]) {
      tasksPerGroup[groupId] = [];
    }
    tasksPerGroup[groupId].push(task);
  });

  Object.entries(tasksPerGroup).forEach(([groupId, rowTasks]) => {
    grouped[groupId] = calculateTaskLanes(rowTasks, reservedLaneZeroByRow?.[groupId]);
  });

  return grouped;
};

export const calculateTimelineRowHeights = (
  tasksByRow: Record<string, TaskWithLane[]>,
  options: {
    minRowHeight: number;
    taskHeight: number;
    taskGap: number;
    /**
     * Lanes the row must have even with no tasks in them — currently one for a
     * time-off bar, which owns lane 0 and never enters calculateTaskLanes.
     * A MINIMUM, not an addition: tasks that overlap the bar were already packed
     * below it by calculateTaskLanes, and tasks outside its days keep lane 0, so
     * adding a lane here would leave an empty strip above every other row.
     */
    minLanesByRow?: Record<string, number>;
  },
) => {
  const heights: Record<string, number> = {};
  Object.entries(tasksByRow).forEach(([groupId, rowTasks]) => {
    const minLanes = options.minLanesByRow?.[groupId] ?? 0;
    // getMaxLanes returns 1 for an empty row, so a row whose only content is the
    // bar still gets exactly one lane.
    const lanes = Math.max(getMaxLanes(rowTasks), minLanes);
    const calculatedHeight = 16 + lanes * (options.taskHeight + options.taskGap);
    heights[groupId] = Math.max(options.minRowHeight, calculatedHeight);
  });
  return heights;
};

/**
 * Converts grouped row data into stable UI rows with labels, colors and row heights.
 */
export const buildTimelineDisplayRows = ({
  groupItems,
  tasksByRow,
  rowHeights,
  groupMode,
  assigneeFilterCount,
  hideUnassigned,
  labels,
  minRowHeight,
  assigneeRowGap,
}: {
  groupItems: TimelineGroupItem[];
  tasksByRow: Record<string, TaskWithLane[]>;
  rowHeights: Record<string, number>;
  groupMode: GroupMode;
  assigneeFilterCount: number;
  hideUnassigned: boolean;
  labels: {
    unassigned: string;
    noProject: string;
  };
  minRowHeight: number;
  assigneeRowGap: number;
}): TimelineDisplayRow[] => {
  const rows: TimelineDisplayRow[] = groupItems.map((item) => {
    const baseHeight = rowHeights[item.id] || minRowHeight;
    const height = groupMode === 'assignee' && item.id !== 'unassigned'
      ? baseHeight + assigneeRowGap
      : baseHeight;
    return {
      ...item,
      tasks: tasksByRow[item.id] || [],
      height,
    };
  });

  const showUnassignedRow = (tasksByRow.unassigned?.length ?? 0) > 0
    && (groupMode === 'project' || (assigneeFilterCount === 0 && !hideUnassigned));
  if (showUnassignedRow) {
    rows.push({
      id: 'unassigned',
      name: groupMode === 'assignee' ? labels.unassigned : labels.noProject,
      color: DEFAULT_NEUTRAL_COLOR,
      tasks: tasksByRow.unassigned ?? [],
      height: rowHeights.unassigned || minRowHeight,
    });
  }

  return rows;
};
