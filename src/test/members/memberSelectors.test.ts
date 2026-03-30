import { describe, expect, it } from 'vitest';
import { Assignee } from '@/features/planner/types/planner';
import {
  buildAvailableGroupMembers,
  buildMemberGroups,
  filterAndSortByName,
  splitAssigneesByActivity,
} from '@/features/members/lib/memberSelectors';

const makeAssignee = (overrides: Partial<Assignee>): Assignee => ({
  id: 'assignee-id',
  name: 'Assignee',
  isActive: true,
  ...overrides,
});

describe('memberSelectors', () => {
  it('splits assignees by activity and keeps alphabetical order', () => {
    const assignees = [
      makeAssignee({ id: 'a2', name: 'Zed', isActive: true }),
      makeAssignee({ id: 'a1', name: 'Ann', isActive: true }),
      makeAssignee({ id: 'a3', name: 'Bob', isActive: false }),
    ];

    const result = splitAssigneesByActivity(assignees);

    expect(result.active.map((assignee) => assignee.id)).toEqual(['a1', 'a2']);
    expect(result.disabled.map((assignee) => assignee.id)).toEqual(['a3']);
  });

  it('builds grouped member buckets with no-group fallback', () => {
    const assignees = [
      makeAssignee({ id: 'a1', name: 'Ann', userId: 'u1' }),
      makeAssignee({ id: 'a2', name: 'Bob', userId: 'u2' }),
      makeAssignee({ id: 'a3', name: 'Zed', userId: 'u3' }),
    ];

    const grouped = buildMemberGroups({
      assignees,
      memberSearch: '',
      memberSort: 'asc',
      memberGroupBy: 'group',
      groupIdByUserId: new Map<string, string | null>([
        ['u1', null],
        ['u2', null],
        ['u3', 'g1'],
      ]),
      groupNameById: new Map<string, string>([['g1', 'Backend']]),
      noGroupLabel: 'No group',
    });

    expect(grouped.map((group) => group.id)).toEqual(['g1', 'none']);
    expect(grouped[0].members.map((assignee) => assignee.id)).toEqual(['a3']);
    expect(grouped[1].members.map((assignee) => assignee.id)).toEqual(['a1', 'a2']);
  });

  it('filters and sorts named items by query', () => {
    const items = [
      { id: 'g1', name: 'Backend' },
      { id: 'g2', name: 'Design' },
      { id: 'g3', name: 'Analytics' },
    ];

    const filtered = filterAndSortByName(items, 'de', 'desc');

    expect(filtered.map((item) => item.id)).toEqual(['g2']);
  });

  it('hides disabled group candidates by default and tracks hidden matches', () => {
    const result = buildAvailableGroupMembers({
      members: [
        { userId: 'u1', email: 'ann@example.com', displayName: 'Ann Workspace' },
        { userId: 'u2', email: 'boris@example.com', displayName: 'Boris Workspace' },
      ],
      groupMembers: [],
      assigneeByUserId: new Map<string, Assignee>([
        ['u1', makeAssignee({ userId: 'u1', name: 'Ann Active', isActive: true })],
        ['u2', makeAssignee({ userId: 'u2', name: 'Boris Disabled', isActive: false })],
      ]),
      search: 'boris',
      includeDisabled: false,
    });

    expect(result.availableMembers).toEqual([]);
    expect(result.hiddenDisabledCount).toBe(1);
  });

  it('shows disabled group candidates when explicitly enabled', () => {
    const result = buildAvailableGroupMembers({
      members: [
        { userId: 'u1', email: 'ann@example.com', displayName: 'Ann Workspace' },
        { userId: 'u2', email: 'boris@example.com', displayName: 'Boris Workspace' },
        { userId: 'u3', email: 'nina@example.com', displayName: 'Nina Workspace' },
      ],
      groupMembers: [{ userId: 'u3' }],
      assigneeByUserId: new Map<string, Assignee>([
        ['u1', makeAssignee({ userId: 'u1', name: 'Ann Active', isActive: true })],
        ['u2', makeAssignee({ userId: 'u2', name: 'Boris Disabled', isActive: false })],
        ['u3', makeAssignee({ userId: 'u3', name: 'Nina Existing', isActive: true })],
      ]),
      search: '',
      includeDisabled: true,
    });

    expect(result.availableMembers.map((member) => member.userId)).toEqual(['u1', 'u2']);
    expect(result.availableMembers[1]?.isActive).toBe(false);
    expect(result.hiddenDisabledCount).toBe(0);
  });
});
