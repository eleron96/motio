import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import type { Assignee, MemberGroupAssignment } from '@/features/planner/types/planner';
import {
  buildGroupIdByUserId,
  buildGroupNameById,
  buildMemberGroups,
  splitAssigneesByActivity,
} from '@/features/members/lib/memberSelectors';

type MemberGroup = { id: string; name: string };

interface UseMembersFilterInput {
  assignees: Assignee[];
  memberGroupAssignments: MemberGroupAssignment[];
  groups: MemberGroup[];
  /** Used to derive the localStorage persistence key. */
  currentWorkspaceId: string | null | undefined;
  userId: string | undefined;
}

/**
 * Manages member search/sort/group-by state and the derived member buckets.
 * Persists `memberSort` and `memberGroupBy` in localStorage keyed by workspace.
 */
export function useMembersFilter({
  assignees,
  memberGroupAssignments,
  groups,
  currentWorkspaceId,
  userId,
}: UseMembersFilterInput) {
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSort, setMemberSort] = useState<'asc' | 'desc'>('asc');
  const [memberGroupBy, setMemberGroupBy] = useState<'none' | 'group'>('none');

  const storageKey = currentWorkspaceId
    ? `members-tasks-view-prefs-${currentWorkspaceId}`
    : userId
    ? `members-tasks-view-prefs-user-${userId}`
    : 'members-tasks-view-prefs';

  const hydratedRef = useRef(false);

  // Hydrate from localStorage
  useEffect(() => {
    hydratedRef.current = false;
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<{
          memberSort: 'asc' | 'desc';
          memberGroupBy: 'none' | 'group';
        }>;
        if (parsed.memberSort === 'asc' || parsed.memberSort === 'desc') {
          setMemberSort(parsed.memberSort);
        }
        if (parsed.memberGroupBy === 'none' || parsed.memberGroupBy === 'group') {
          setMemberGroupBy(parsed.memberGroupBy);
        }
      } catch {
        // Ignore invalid localStorage payload.
      }
    }
    hydratedRef.current = true;
  }, [storageKey]);

  // Persist to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hydratedRef.current) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ memberSort, memberGroupBy }));
  }, [memberGroupBy, memberSort, storageKey]);

  const { active: activeAssignees, disabled: disabledAssignees } = useMemo(
    () => splitAssigneesByActivity(assignees),
    [assignees],
  );

  const groupNameById = useMemo(
    () => buildGroupNameById(groups),
    [groups],
  );

  const groupIdByUserId = useMemo(
    () => buildGroupIdByUserId(memberGroupAssignments),
    [memberGroupAssignments],
  );

  const activeMemberGroups = useMemo(
    () => buildMemberGroups({
      assignees: activeAssignees,
      memberSearch,
      memberSort,
      memberGroupBy,
      groupIdByUserId,
      groupNameById,
      noGroupLabel: t`No group`,
    }),
    [activeAssignees, groupIdByUserId, groupNameById, memberGroupBy, memberSearch, memberSort],
  );

  const disabledMemberGroups = useMemo(
    () => buildMemberGroups({
      assignees: disabledAssignees,
      memberSearch,
      memberSort,
      memberGroupBy,
      groupIdByUserId,
      groupNameById,
      noGroupLabel: t`No group`,
    }),
    [disabledAssignees, groupIdByUserId, groupNameById, memberGroupBy, memberSearch, memberSort],
  );

  const activeVisibleAssignees = useMemo(
    () => activeMemberGroups.flatMap((group) => group.members),
    [activeMemberGroups],
  );

  const disabledVisibleAssignees = useMemo(
    () => disabledMemberGroups.flatMap((group) => group.members),
    [disabledMemberGroups],
  );

  return {
    memberSearch,
    setMemberSearch,
    memberSort,
    setMemberSort,
    memberGroupBy,
    setMemberGroupBy,
    activeAssignees,
    disabledAssignees,
    activeMemberGroups,
    disabledMemberGroups,
    activeVisibleAssignees,
    disabledVisibleAssignees,
  };
}
