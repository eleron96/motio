import { useCallback, useState } from 'react';
import type { Assignee } from '@/features/planner/types/planner';
import type { PlannerGroupMember } from '@/features/planner/store/plannerStore.contract';

interface UseMemberGroupFlowOptions {
  groupIdByUserId: Map<string, string | null>;
  groupNameById: Map<string, string>;
  selectedGroupId: string | null;
  selectedGroupName: string | null;
  handleAssignMemberToGroup: (userId: string, groupId: string | null) => Promise<unknown>;
  handleDeleteGroup: (group: { id: string; name: string }) => Promise<unknown>;
}

/**
 * Moving people between groups and deleting a group, behind confirmations.
 * Assigning is one flow with two entry points — the people list and a group's
 * own member list — so its state lives on the page rather than in either.
 */
export const useMemberGroupFlow = ({
  groupIdByUserId,
  groupNameById,
  selectedGroupId,
  selectedGroupName,
  handleAssignMemberToGroup,
  handleDeleteGroup,
}: UseMemberGroupFlowOptions) => {
  const [groupAssignTarget, setGroupAssignTarget] = useState<{
    userId: string;
    name: string;
    currentGroupId: string | null;
  } | null>(null);
  const [groupRemoveTarget, setGroupRemoveTarget] = useState<{
    userId: string;
    name: string;
    groupName: string | null;
  } | null>(null);

  const openAssigneeGroupDialog = useCallback((assignee: Assignee) => {
    if (!assignee.userId) return;
    setGroupAssignTarget({
      userId: assignee.userId,
      name: assignee.name,
      currentGroupId: groupIdByUserId.get(assignee.userId) ?? null,
    });
  }, [groupIdByUserId]);

  const requestAssigneeGroupRemoval = useCallback((assignee: Assignee) => {
    if (!assignee.userId) return;
    const currentGroupId = groupIdByUserId.get(assignee.userId) ?? null;
    setGroupRemoveTarget({
      userId: assignee.userId,
      name: assignee.name,
      groupName: currentGroupId ? (groupNameById.get(currentGroupId) ?? null) : null,
    });
  }, [groupIdByUserId, groupNameById]);

  const openGroupMemberMoveDialog = useCallback((member: PlannerGroupMember) => {
    setGroupAssignTarget({
      userId: member.userId,
      name: member.displayName || member.email,
      currentGroupId: selectedGroupId,
    });
  }, [selectedGroupId]);

  const requestGroupMemberRemoval = useCallback((member: PlannerGroupMember) => {
    setGroupRemoveTarget({
      userId: member.userId,
      name: member.displayName || member.email,
      groupName: selectedGroupName,
    });
  }, [selectedGroupName]);

  const handleGroupSelected = useCallback((groupId: string) => {
    if (!groupAssignTarget) return;
    void handleAssignMemberToGroup(groupAssignTarget.userId, groupId);
    setGroupAssignTarget(null);
  }, [groupAssignTarget, handleAssignMemberToGroup]);

  const confirmGroupRemoval = useCallback(() => {
    if (!groupRemoveTarget) return;
    void handleAssignMemberToGroup(groupRemoveTarget.userId, null);
    setGroupRemoveTarget(null);
  }, [groupRemoveTarget, handleAssignMemberToGroup]);

  const [groupDeleteTarget, setGroupDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const requestGroupDeletion = useCallback((group: { id: string; name: string }) => {
    setGroupDeleteTarget(group);
  }, []);

  const confirmGroupDeletion = useCallback(() => {
    if (!groupDeleteTarget) return;
    void handleDeleteGroup(groupDeleteTarget);
    setGroupDeleteTarget(null);
  }, [groupDeleteTarget, handleDeleteGroup]);

  return {
    groupAssignTarget,
    setGroupAssignTarget,
    groupRemoveTarget,
    setGroupRemoveTarget,
    openAssigneeGroupDialog,
    requestAssigneeGroupRemoval,
    openGroupMemberMoveDialog,
    requestGroupMemberRemoval,
    handleGroupSelected,
    confirmGroupRemoval,
    groupDeleteTarget,
    setGroupDeleteTarget,
    requestGroupDeletion,
    confirmGroupDeletion,
  };
};

export type MemberGroupFlow = ReturnType<typeof useMemberGroupFlow>;
