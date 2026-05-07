import type { Assignee, ProjectMember } from '@/features/planner/types/planner';

export interface MemberGroupAssignment {
  groupId: string;
  userId: string;
}

interface ComputeGroupMembersToAddInput {
  /** Project to which we are adding members. */
  projectId: string;
  /** Group whose members should be added. `null` resolves to "no-op". */
  groupId: string | null;
  /** All workspace ↔ group memberships. */
  memberGroupAssignments: MemberGroupAssignment[];
  /** All workspace assignees (we only add the ones with a `userId`). */
  assignees: Assignee[];
  /** Existing project_members rows for any project. We only consider rows
   * that belong to the given `projectId` and that already point at an
   * assignee — external members are ignored.
   */
  projectMembers: ProjectMember[];
}

/**
 * Pure helper that decides which assignees should be added to a project
 * when its owner team (`groupId`) changes.
 *
 * Rules:
 * 1. `groupId === null` → empty list (the project has no owner team).
 * 2. Group with no member rows → empty list.
 * 3. Only assignees that have a `userId` (workspace members) are added —
 *    external assignees are skipped.
 * 4. Assignees that are already members of the project (by `assigneeId`)
 *    are skipped, so re-running the sync is idempotent.
 *
 * The function returns the assignees in their original order so callers
 * can invoke `addProjectMember` predictably.
 */
export const computeGroupMembersToAdd = (
  input: ComputeGroupMembersToAddInput,
): Assignee[] => {
  const { projectId, groupId, memberGroupAssignments, assignees, projectMembers } = input;
  if (!groupId) return [];

  const userIdsInGroup = new Set(
    memberGroupAssignments
      .filter((row) => row.groupId === groupId)
      .map((row) => row.userId),
  );
  if (userIdsInGroup.size === 0) return [];

  const alreadyMember = new Set(
    projectMembers
      .filter((row) => row.projectId === projectId && row.assigneeId)
      .map((row) => row.assigneeId as string),
  );

  return assignees.filter((assignee) => (
    !!assignee.userId
    && userIdsInGroup.has(assignee.userId)
    && !alreadyMember.has(assignee.id)
  ));
};
