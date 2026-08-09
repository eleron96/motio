import type { Milestone } from '@/features/planner/types/planner';
import { deriveMilestonesWithStatus } from '@/features/projects/lib/projectCard/deriveMilestoneStatus';

/**
 * How many milestones each project still has ahead of it.
 *
 * Past and done ones are left out on purpose: the lists want to say "what is
 * left", not a lifetime total. Milestones are bucketed per project before their
 * status is derived, so a project's explicit `statusOverride` is honoured
 * against its own set rather than the whole workspace.
 */
export const countUpcomingMilestones = (
  milestones: Milestone[],
  today: Date,
): Map<string, number> => {
  const buckets = new Map<string, Milestone[]>();
  for (const milestone of milestones) {
    const list = buckets.get(milestone.projectId);
    if (list) {
      list.push(milestone);
    } else {
      buckets.set(milestone.projectId, [milestone]);
    }
  }

  const counts = new Map<string, number>();
  for (const [projectId, list] of buckets) {
    const ahead = deriveMilestonesWithStatus(list, today)
      .filter((milestone) => milestone.status !== 'done')
      .length;
    if (ahead > 0) {
      counts.set(projectId, ahead);
    }
  }
  return counts;
};
