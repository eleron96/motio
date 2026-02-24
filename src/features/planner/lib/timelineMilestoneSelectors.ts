import { format } from 'date-fns';
import { Milestone, Project } from '@/features/planner/types/planner';

export type TimelineMilestoneLine = {
  date: string;
  color: string;
};

export type TimelineMilestoneTooltipCell = {
  date: string;
  dayIndex: number;
  color: string;
  milestones: Milestone[];
};

export const filterMilestonesByProjects = (
  milestones: Milestone[],
  projectIds: string[],
) => {
  if (projectIds.length === 0) return milestones;
  return milestones.filter((milestone) => projectIds.includes(milestone.projectId));
};

export const sortMilestonesByDateAndTitle = (milestones: Milestone[]) => (
  [...milestones].sort((left, right) => {
    if (left.date === right.date) {
      return left.title.localeCompare(right.title);
    }
    return left.date.localeCompare(right.date);
  })
);

export const buildVisibleDayIndexMap = (visibleDays: Date[]) => {
  const map = new Map<string, number>();
  visibleDays.forEach((day, index) => {
    map.set(format(day, 'yyyy-MM-dd'), index);
  });
  return map;
};

export const groupMilestonesByDate = (milestones: Milestone[]) => {
  const map = new Map<string, Milestone[]>();
  milestones.forEach((milestone) => {
    const list = map.get(milestone.date) ?? [];
    list.push(milestone);
    map.set(milestone.date, list);
  });
  return map;
};

export const calculateMilestoneOffsets = (milestonesByDate: Map<string, Milestone[]>) => {
  const offsets = new Map<string, number>();
  milestonesByDate.forEach((items) => {
    items.forEach((item, index) => {
      const offset = items.length > 1 ? (index - (items.length - 1) / 2) * 8 : 0;
      offsets.set(item.id, offset);
    });
  });
  return offsets;
};

export const buildVisibleMilestoneLines = ({
  milestones,
  visibleDayIndex,
  projectById,
  defaultColor,
}: {
  milestones: Milestone[];
  visibleDayIndex: Map<string, number>;
  projectById: Map<string, Project>;
  defaultColor: string;
}): TimelineMilestoneLine[] => {
  const lines: TimelineMilestoneLine[] = [];
  const seenDates = new Set<string>();
  for (const milestone of milestones) {
    if (!visibleDayIndex.has(milestone.date) || seenDates.has(milestone.date)) continue;
    seenDates.add(milestone.date);
    const project = projectById.get(milestone.projectId);
    lines.push({ date: milestone.date, color: project?.color ?? defaultColor });
  }
  return lines;
};

/**
 * Builds day cells for tooltip and context-menu overlays in milestone header rows.
 */
export const buildMilestoneTooltipCells = ({
  milestonesByDate,
  visibleDayIndex,
  projectById,
  defaultColor,
}: {
  milestonesByDate: Map<string, Milestone[]>;
  visibleDayIndex: Map<string, number>;
  projectById: Map<string, Project>;
  defaultColor: string;
}): TimelineMilestoneTooltipCell[] => {
  const cells: TimelineMilestoneTooltipCell[] = [];
  milestonesByDate.forEach((dayMilestones, date) => {
    const dayIndex = visibleDayIndex.get(date);
    if (typeof dayIndex !== 'number') return;
    const project = projectById.get(dayMilestones[0]?.projectId ?? '');
    cells.push({
      date,
      dayIndex,
      color: project?.color ?? defaultColor,
      milestones: dayMilestones,
    });
  });
  cells.sort((left, right) => left.dayIndex - right.dayIndex);
  return cells;
};
