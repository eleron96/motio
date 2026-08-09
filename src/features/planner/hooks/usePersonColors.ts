import { useMemo } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { buildPersonColorMap } from '@/features/planner/lib/timeOffPalette';

export type PersonColorLookup = {
  /** Colour in effect for a person, by assignee id. */
  byAssigneeId: Map<string, string>;
  /** Same colours keyed by account id, for screens that only hold a user id. */
  byUserId: Map<string, string>;
};

/**
 * The colour a person is drawn in anywhere in the app: the one picked in
 * workspace settings, or the automatic palette slot the calendar would give
 * them. Both keys exist because screens hold different halves of a person — the
 * timeline knows assignees, comments and members know accounts.
 *
 * Empty until the planner store has loaded the workspace, which is fine:
 * consumers fall back to the id-hashed monogram colour for that first paint.
 */
export const usePersonColors = (): PersonColorLookup => {
  const assignees = usePlannerStore((state) => state.assignees);

  return useMemo(() => {
    // Array-checked rather than null-checked: this hook is called from avatars on
    // every screen, including ones whose tests stub the store without a people
    // list, and a colour is never worth taking a page down for.
    const people = Array.isArray(assignees) ? assignees : [];
    const byAssigneeId = buildPersonColorMap(people);
    const byUserId = new Map<string, string>();
    people.forEach((assignee) => {
      const color = byAssigneeId.get(assignee.id);
      if (assignee.userId && color) byUserId.set(assignee.userId, color);
    });
    return { byAssigneeId, byUserId };
  }, [assignees]);
};
