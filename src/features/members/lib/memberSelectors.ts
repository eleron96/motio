import { Assignee } from '@/features/planner/types/planner';
import { compareNames } from '@/shared/lib/nameSorting';

type NameSort = 'asc' | 'desc';
type MemberGroupBy = 'none' | 'group';

type GroupNameRef = {
  id: string;
  name: string;
};

type GroupAssignmentRef = {
  userId: string;
  groupId: string | null;
};

type WorkspaceMemberRef = {
  userId: string;
  email: string;
  displayName: string | null;
};

type GroupMemberRef = {
  userId: string;
};

export type MemberGroupBucket = {
  id: string;
  name: string | null;
  members: Assignee[];
};

export type AvailableGroupMember = {
  userId: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
};

export const splitAssigneesByActivity = (assignees: Assignee[]) => ({
  active: [...assignees]
    .filter((assignee) => assignee.isActive)
    .sort((left, right) => left.name.localeCompare(right.name)),
  disabled: [...assignees]
    .filter((assignee) => !assignee.isActive)
    .sort((left, right) => left.name.localeCompare(right.name)),
});

export const buildGroupNameById = (groups: GroupNameRef[]) => (
  new Map(groups.map((group) => [group.id, group.name]))
);

export const buildGroupIdByUserId = (assignments: GroupAssignmentRef[]) => (
  new Map(assignments.map((assignment) => [assignment.userId, assignment.groupId]))
);

/**
 * Produces UI-ready member buckets with deterministic order for search, sort and grouping mode.
 */
export const buildMemberGroups = ({
  assignees,
  memberSearch,
  memberSort,
  memberGroupBy,
  groupIdByUserId,
  groupNameById,
  noGroupLabel,
}: {
  assignees: Assignee[];
  memberSearch: string;
  memberSort: NameSort;
  memberGroupBy: MemberGroupBy;
  groupIdByUserId: Map<string, string | null>;
  groupNameById: Map<string, string>;
  noGroupLabel: string;
}): MemberGroupBucket[] => {
  const normalizedSearch = memberSearch.trim().toLowerCase();
  const filtered = normalizedSearch.length > 0
    ? assignees.filter((assignee) => assignee.name.toLowerCase().includes(normalizedSearch))
    : assignees;

  const sorted = [...filtered].sort((left, right) => compareNames(left.name, right.name, memberSort));
  if (memberGroupBy === 'none') {
    return [{ id: 'all', name: null, members: sorted }];
  }

  const buckets = new Map<string, Assignee[]>();
  sorted.forEach((assignee) => {
    const groupId = assignee.userId ? groupIdByUserId.get(assignee.userId) ?? 'none' : 'none';
    const bucketKey = groupId ?? 'none';
    const list = buckets.get(bucketKey) ?? [];
    list.push(assignee);
    buckets.set(bucketKey, list);
  });

  return Array.from(buckets.entries())
    .map(([id, members]) => ({
      id,
      name: id === 'none' ? noGroupLabel : groupNameById.get(id) ?? noGroupLabel,
      members,
    }))
    .sort((left, right) => compareNames(left.name ?? '', right.name ?? '', 'asc'));
};

export const filterAndSortByName = <T extends { name: string }>(
  items: T[],
  search: string,
  sort: NameSort,
) => {
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch.length > 0
    ? items.filter((item) => item.name.toLowerCase().includes(normalizedSearch))
    : items;
  return [...filtered].sort((left, right) => compareNames(left.name, right.name, sort));
};

export const buildAvailableGroupMembers = ({
  members,
  groupMembers,
  assigneeByUserId,
  search,
  includeDisabled,
}: {
  members: WorkspaceMemberRef[];
  groupMembers: GroupMemberRef[];
  assigneeByUserId: Map<string, Assignee>;
  search: string;
  includeDisabled: boolean;
}) => {
  const groupMemberUserIds = new Set(groupMembers.map((member) => member.userId));
  const normalizedSearch = search.trim().toLowerCase();
  const matchedMembers = members
    .filter((member) => !groupMemberUserIds.has(member.userId))
    .map((member) => {
      const assignee = assigneeByUserId.get(member.userId);
      return {
        userId: member.userId,
        email: member.email,
        displayName: assignee?.name ?? member.displayName ?? null,
        isActive: assignee?.isActive ?? true,
      } satisfies AvailableGroupMember;
    })
    .filter((member) => (
      normalizedSearch.length === 0
        || member.email.toLowerCase().includes(normalizedSearch)
        || member.displayName?.toLowerCase().includes(normalizedSearch)
    ))
    .sort((left, right) => compareNames(left.displayName ?? left.email, right.displayName ?? right.email, 'asc'));

  const hiddenDisabledCount = includeDisabled
    ? 0
    : matchedMembers.filter((member) => !member.isActive).length;

  return {
    availableMembers: includeDisabled
      ? matchedMembers
      : matchedMembers.filter((member) => member.isActive),
    hiddenDisabledCount,
  };
};
