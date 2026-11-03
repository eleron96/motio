import { useMemo } from 'react';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { buildAssigneeGroupMap, selectFilteredTasks } from '@/features/planner/lib/timelineSelectors';
import type {
  Assignee,
  Filters,
  MemberGroupAssignment,
  Milestone,
  Project,
  Task,
} from '@/features/planner/types/planner';

interface UseCalendarMarksOptions {
  tasks: Task[];
  filters: Filters;
  assignees: Assignee[];
  memberGroupAssignments: MemberGroupAssignment[];
  projects: Project[];
  milestones: Milestone[];
  userId: string | undefined;
}

/**
 * What each calendar day carries under the current filters: how many tasks
 * (and how many of them are mine) and which milestones.
 */
export const useCalendarMarks = ({
  tasks,
  filters,
  assignees,
  memberGroupAssignments,
  projects,
  milestones,
  userId,
}: UseCalendarMarksOptions) => {
  const assigneeGroupMap = useMemo(
    () => buildAssigneeGroupMap(assignees, memberGroupAssignments),
    [assignees, memberGroupAssignments],
  );

  const filteredTasks = useMemo(
    () => selectFilteredTasks(tasks, filters, assigneeGroupMap, assignees),
    [tasks, filters, assigneeGroupMap, assignees],
  );

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );

  const assigneeById = useMemo(
    () => new Map(assignees.map((assignee) => [assignee.id, assignee])),
    [assignees],
  );

  const filteredMilestones = useMemo(() => {
    if (filters.projectIds.length === 0) return milestones;
    return milestones.filter((milestone) => filters.projectIds.includes(milestone.projectId));
  }, [milestones, filters.projectIds]);

  const sortedMilestones = useMemo(() => {
    return [...filteredMilestones].sort((left, right) => {
      if (left.date === right.date) {
        return left.title.localeCompare(right.title);
      }
      return left.date.localeCompare(right.date);
    });
  }, [filteredMilestones]);

  const milestonesByDate = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    sortedMilestones.forEach((milestone) => {
      const list = map.get(milestone.date) ?? [];
      list.push(milestone);
      map.set(milestone.date, list);
    });
    return map;
  }, [sortedMilestones]);

  const myAssigneeId = useMemo(() => {
    if (!userId) return null;
    return assignees.find((assignee) => assignee.userId === userId)?.id ?? null;
  }, [assignees, userId]);

  const taskCounts = useMemo(() => {
    const counts = new Map<string, { total: number; mine: number }>();
    filteredTasks.forEach(task => {
      const start = parseISO(task.startDate);
      const end = parseISO(task.endDate);
      eachDayOfInterval({ start, end }).forEach(day => {
        const key = format(day, 'yyyy-MM-dd');
        const entry = counts.get(key) ?? { total: 0, mine: 0 };
        entry.total += 1;
        if (myAssigneeId && task.assigneeIds.includes(myAssigneeId)) {
          entry.mine += 1;
        }
        counts.set(key, entry);
      });
    });
    return counts;
  }, [filteredTasks, myAssigneeId]);

  return { projectById, assigneeById, milestonesByDate, myAssigneeId, taskCounts };
};
