type AccessAssigneeRecord = {
  isActive: boolean;
};

/**
 * A member with no assignee row yet counts as active: the row appears on the
 * first workspace load, and until then "no row" must not read as "disabled".
 */
export const isMemberAccessActive = (assignee: AccessAssigneeRecord | null | undefined) => (
  assignee?.isActive ?? true
);

/**
 * Splits workspace members into the two access buckets the settings screen
 * shows. Both the tab counters and the lists behind them read from here, so a
 * person can never be counted in one bucket and listed in the other.
 */
export const splitMembersByAccess = <T extends { userId: string }>(
  members: T[],
  assigneeByUserId: Map<string, AccessAssigneeRecord>,
) => {
  const active: T[] = [];
  const disabled: T[] = [];

  members.forEach((member) => {
    if (isMemberAccessActive(assigneeByUserId.get(member.userId))) {
      active.push(member);
      return;
    }
    disabled.push(member);
  });

  return { active, disabled };
};
