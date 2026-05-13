import { describe, it, expect } from 'vitest';
import { computeGroupMembersToAdd } from '@/features/projects/lib/projectCard/computeGroupMembersToAdd';
import type { Assignee, ProjectMember } from '@/features/planner/types/planner';

const mkAssignee = (overrides: Partial<Assignee> = {}): Assignee => ({
  id: overrides.id ?? 'a-id',
  name: overrides.name ?? 'Assignee',
  isActive: overrides.isActive ?? true,
  userId: overrides.userId ?? null,
  email: overrides.email ?? null,
  phone: overrides.phone ?? null,
});

const mkMember = (overrides: Partial<ProjectMember>): ProjectMember => ({
  id: overrides.id ?? 'm-id',
  projectId: overrides.projectId ?? 'p1',
  assigneeId: overrides.assigneeId ?? null,
  role: overrides.role ?? null,
  position: overrides.position ?? 0,
  tag: overrides.tag ?? null,
  externalName: overrides.externalName ?? null,
  externalCompany: overrides.externalCompany ?? null,
  externalEmail: overrides.externalEmail ?? null,
  externalPhone: overrides.externalPhone ?? null,
});

describe('computeGroupMembersToAdd', () => {
  it('returns empty when groupId is null', () => {
    const result = computeGroupMembersToAdd({
      projectId: 'p1',
      groupId: null,
      memberGroupAssignments: [{ groupId: 'g1', userId: 'u1' }],
      assignees: [mkAssignee({ id: 'a1', userId: 'u1' })],
      projectMembers: [],
    });
    expect(result).toEqual([]);
  });

  it('returns empty when group has no member assignments', () => {
    const result = computeGroupMembersToAdd({
      projectId: 'p1',
      groupId: 'g1',
      memberGroupAssignments: [{ groupId: 'g2', userId: 'u1' }], // different group
      assignees: [mkAssignee({ id: 'a1', userId: 'u1' })],
      projectMembers: [],
    });
    expect(result).toEqual([]);
  });

  it('skips assignees without a userId (external/non-workspace)', () => {
    const result = computeGroupMembersToAdd({
      projectId: 'p1',
      groupId: 'g1',
      memberGroupAssignments: [{ groupId: 'g1', userId: 'u1' }],
      assignees: [
        mkAssignee({ id: 'a1', userId: null }),
        mkAssignee({ id: 'a2', userId: 'u1' }),
      ],
      projectMembers: [],
    });
    expect(result.map((a) => a.id)).toEqual(['a2']);
  });

  it('adds all matching workspace assignees when no overlap with existing members', () => {
    const result = computeGroupMembersToAdd({
      projectId: 'p1',
      groupId: 'g1',
      memberGroupAssignments: [
        { groupId: 'g1', userId: 'u1' },
        { groupId: 'g1', userId: 'u2' },
      ],
      assignees: [
        mkAssignee({ id: 'a1', userId: 'u1' }),
        mkAssignee({ id: 'a2', userId: 'u2' }),
        mkAssignee({ id: 'a3', userId: 'u3' }), // not in group
      ],
      projectMembers: [],
    });
    expect(result.map((a) => a.id).sort()).toEqual(['a1', 'a2']);
  });

  it('skips assignees already in the project (idempotent re-runs)', () => {
    const result = computeGroupMembersToAdd({
      projectId: 'p1',
      groupId: 'g1',
      memberGroupAssignments: [
        { groupId: 'g1', userId: 'u1' },
        { groupId: 'g1', userId: 'u2' },
      ],
      assignees: [
        mkAssignee({ id: 'a1', userId: 'u1' }),
        mkAssignee({ id: 'a2', userId: 'u2' }),
      ],
      projectMembers: [
        mkMember({ id: 'm1', projectId: 'p1', assigneeId: 'a1' }),
      ],
    });
    expect(result.map((a) => a.id)).toEqual(['a2']);
  });

  it('does not consider members from other projects when checking duplicates', () => {
    const result = computeGroupMembersToAdd({
      projectId: 'p1',
      groupId: 'g1',
      memberGroupAssignments: [{ groupId: 'g1', userId: 'u1' }],
      assignees: [mkAssignee({ id: 'a1', userId: 'u1' })],
      projectMembers: [
        // member of another project — must not block adding to p1
        mkMember({ id: 'm-other', projectId: 'p2', assigneeId: 'a1' }),
      ],
    });
    expect(result.map((a) => a.id)).toEqual(['a1']);
  });

  it('ignores existing external members (no assigneeId) when matching', () => {
    const result = computeGroupMembersToAdd({
      projectId: 'p1',
      groupId: 'g1',
      memberGroupAssignments: [{ groupId: 'g1', userId: 'u1' }],
      assignees: [mkAssignee({ id: 'a1', userId: 'u1' })],
      projectMembers: [
        mkMember({ id: 'm-ext', projectId: 'p1', assigneeId: null, externalName: 'External' }),
      ],
    });
    expect(result.map((a) => a.id)).toEqual(['a1']);
  });

  it('handles a user appearing in multiple groups (only the requested group counts)', () => {
    const result = computeGroupMembersToAdd({
      projectId: 'p1',
      groupId: 'g1',
      memberGroupAssignments: [
        { groupId: 'g1', userId: 'u1' },
        { groupId: 'g2', userId: 'u1' },
        { groupId: 'g2', userId: 'u2' },
      ],
      assignees: [
        mkAssignee({ id: 'a1', userId: 'u1' }),
        mkAssignee({ id: 'a2', userId: 'u2' }),
      ],
      projectMembers: [],
    });
    // Only u1 is in g1; u2 is in g2 only.
    expect(result.map((a) => a.id)).toEqual(['a1']);
  });

  it('preserves original assignee ordering', () => {
    const result = computeGroupMembersToAdd({
      projectId: 'p1',
      groupId: 'g1',
      memberGroupAssignments: [
        { groupId: 'g1', userId: 'u1' },
        { groupId: 'g1', userId: 'u2' },
        { groupId: 'g1', userId: 'u3' },
      ],
      assignees: [
        mkAssignee({ id: 'a3', userId: 'u3' }),
        mkAssignee({ id: 'a1', userId: 'u1' }),
        mkAssignee({ id: 'a2', userId: 'u2' }),
      ],
      projectMembers: [],
    });
    expect(result.map((a) => a.id)).toEqual(['a3', 'a1', 'a2']);
  });
});
