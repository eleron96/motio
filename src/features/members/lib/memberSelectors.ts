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

export type MemberGroupBucket = {
  id: string;
  name: string | null;
  members: Assignee[];
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
