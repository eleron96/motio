import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Milestone } from '@/features/planner/types/planner';

export type MilestoneStatus = 'done' | 'current' | 'upcoming';

export interface MilestoneWithStatus extends Milestone {
  status: MilestoneStatus;
}

const compareByDateAsc = (a: Milestone, b: Milestone): number => (
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
);

/**
 * Derives the timeline status for each milestone:
 *   • If the milestone has an explicit `statusOverride`, use it as-is.
 *   • Otherwise infer from `date` relative to `today`:
 *     - past   → `done`
 *     - the next not-yet-passed milestone → `current`
 *     - everything else in the future     → `upcoming`
 *
 * The `statusOverride` column was added on top of this heuristic so existing
 * milestones still get a sensible status without manual upkeep.
 */
export const deriveMilestonesWithStatus = (
  milestones: readonly Milestone[],
  today: Date,
): MilestoneWithStatus[] => {
  const sorted = [...milestones].sort(compareByDateAsc);
  let currentAssigned = false;
  return sorted.map<MilestoneWithStatus>((milestone) => {
    if (milestone.statusOverride) {
      if (milestone.statusOverride === 'current') currentAssigned = true;
      return { ...milestone, status: milestone.statusOverride };
    }
    const date = parseISO(milestone.date);
    const diff = differenceInCalendarDays(date, today);
    if (diff < 0) {
      return { ...milestone, status: 'done' };
    }
    if (!currentAssigned) {
      currentAssigned = true;
      return { ...milestone, status: 'current' };
    }
    return { ...milestone, status: 'upcoming' };
  });
};
