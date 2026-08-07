import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import type { WorkspaceRole } from '@/features/auth/store/authStore';
import { filterAndSortByName } from '@/features/members/lib/memberSelectors';

type MemberGroup = { id: string; name: string };

type GroupMember = {
  userId: string;
  role: WorkspaceRole;
  email: string;
  displayName: string | null;
};

interface UseMemberGroupsInput {
  currentWorkspaceId: string | null | undefined;
  isAdmin: boolean;
  fetchMemberGroups: (workspaceId: string) => Promise<{ groups: MemberGroup[]; error?: string }>;
  fetchGroupMembers: (workspaceId: string, groupId: string) => Promise<{ members: GroupMember[]; error?: string }>;
  createMemberGroup: (workspaceId: string, name: string) => Promise<{ groupId?: string; error?: string }>;
  updateMemberGroup: (workspaceId: string, groupId: string, name: string) => Promise<{ error?: string }>;
  deleteMemberGroup: (workspaceId: string, groupId: string) => Promise<{ error?: string }>;
  assignMemberToGroup: (userId: string, groupId: string | null) => Promise<{ error?: string }>;
  mode: string;
}

export function useMemberGroups({
  currentWorkspaceId,
  isAdmin,
  fetchMemberGroups,
  fetchGroupMembers,
  createMemberGroup,
  updateMemberGroup,
  deleteMemberGroup,
  assignMemberToGroup,
  mode,
}: UseMemberGroupsInput) {
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [groupSort, setGroupSort] = useState<'asc' | 'desc'>('asc');
  const [groupSearch, setGroupSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupMembersError, setGroupMembersError] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupActionLoading, setGroupActionLoading] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  const fetchGroups = useCallback(async () => {
    if (!currentWorkspaceId) return;
    setGroupsLoading(true);
    setGroupsError('');
    const result = await fetchMemberGroups(currentWorkspaceId);
    if (result.error) {
      setGroupsError(result.error);
      setGroupsLoading(false);
      return;
    }
    setGroups(result.groups);
    setGroupsLoading(false);
  }, [currentWorkspaceId, fetchMemberGroups]);

  const fetchSelectedGroupMembers = useCallback(async (groupId: string) => {
    if (!currentWorkspaceId) return;
    setGroupMembersLoading(true);
    setGroupMembersError('');
    const result = await fetchGroupMembers(currentWorkspaceId, groupId);
    if (result.error) {
      setGroupMembersError(result.error);
      setGroupMembersLoading(false);
      return;
    }
    setGroupMembers(result.members.map((member) => ({
      ...member,
      email: member.email || t`unknown`,
    })));
    setGroupMembersLoading(false);
  }, [currentWorkspaceId, fetchGroupMembers]);

  // Load groups when workspace changes
  useEffect(() => {
    if (currentWorkspaceId) {
      void fetchGroups();
    }
  }, [currentWorkspaceId, fetchGroups]);

  // Keep selected group valid
  useEffect(() => {
    if (groups.length === 0) {
      setSelectedGroupId(null);
      return;
    }
    if (!selectedGroupId || !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  // Reload group members when selection or mode changes
  useEffect(() => {
    if (mode !== 'groups') return;
    if (!selectedGroupId) {
      setGroupMembers([]);
      return;
    }
    void fetchSelectedGroupMembers(selectedGroupId);
  }, [fetchSelectedGroupMembers, mode, selectedGroupId]);

  // Clear editing state when group selection changes
  useEffect(() => {
    if (!selectedGroupId || selectedGroupId !== editingGroupId) {
      setEditingGroupId(null);
      setEditingGroupName('');
    }
  }, [editingGroupId, selectedGroupId]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const sortedGroups = useMemo(
    () => filterAndSortByName(groups, groupSearch, groupSort),
    [groupSearch, groupSort, groups],
  );

  const handleCreateGroup = useCallback(async () => {
    if (!currentWorkspaceId || !isAdmin) return;
    const trimmedName = newGroupName.trim();
    if (!trimmedName) return;
    setGroupActionLoading(true);
    setGroupsError('');
    const result = await createMemberGroup(currentWorkspaceId, trimmedName);
    if (result.error) {
      setGroupsError(result.error);
      setGroupActionLoading(false);
      return;
    }
    setNewGroupName('');
    setCreatingGroup(false);
    await fetchGroups();
    if (result.groupId) {
      setSelectedGroupId(result.groupId);
    }
    setGroupActionLoading(false);
  }, [createMemberGroup, currentWorkspaceId, fetchGroups, isAdmin, newGroupName]);

  const handleStartEditGroup = useCallback((group: MemberGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  }, []);

  const handleSaveGroupName = useCallback(async () => {
    if (!currentWorkspaceId || !editingGroupId || !isAdmin) return;
    const trimmedName = editingGroupName.trim();
    if (!trimmedName) return;
    setGroupActionLoading(true);
    setGroupsError('');
    const result = await updateMemberGroup(currentWorkspaceId, editingGroupId, trimmedName);
    if (result.error) {
      setGroupsError(result.error);
      setGroupActionLoading(false);
      return;
    }
    await fetchGroups();
    setEditingGroupId(null);
    setEditingGroupName('');
    setGroupActionLoading(false);
  }, [currentWorkspaceId, editingGroupId, editingGroupName, fetchGroups, isAdmin, updateMemberGroup]);

  const handleDeleteGroup = useCallback(async (group?: MemberGroup) => {
    if (!currentWorkspaceId || !isAdmin) return;
    const targetGroupId = group?.id ?? selectedGroupId;
    if (!targetGroupId) return;
    if (typeof window !== 'undefined') {
      const groupName = group?.name ?? selectedGroup?.name ?? 'this group';
      const confirmed = window.confirm(`Delete "${groupName}"?`);
      if (!confirmed) return;
    }
    setGroupActionLoading(true);
    setGroupsError('');
    const result = await deleteMemberGroup(currentWorkspaceId, targetGroupId);
    if (result.error) {
      setGroupsError(result.error);
      setGroupActionLoading(false);
      return;
    }
    await fetchGroups();
    setGroupActionLoading(false);
  }, [currentWorkspaceId, deleteMemberGroup, fetchGroups, isAdmin, selectedGroup?.name, selectedGroupId]);

  /**
   * The one way a person's group changes: joining one, moving between two, or
   * being taken out (`null`). Everything else routes through here so loading,
   * errors and the refetch cannot drift apart between the callers.
   */
  const handleAssignMemberToGroup = useCallback(async (userId: string, groupId: string | null) => {
    if (!currentWorkspaceId || !isAdmin) return;
    setGroupActionLoading(true);
    setGroupsError('');
    const result = await assignMemberToGroup(userId, groupId);
    if (result.error) {
      setGroupsError(result.error);
      setGroupActionLoading(false);
      return;
    }
    // The open group is the list on screen: refresh it whether the person just
    // joined it or just left it for somewhere else.
    if (selectedGroupId) {
      await fetchSelectedGroupMembers(selectedGroupId);
    }
    setGroupActionLoading(false);
  }, [assignMemberToGroup, currentWorkspaceId, fetchSelectedGroupMembers, isAdmin, selectedGroupId]);

  const handleAddMemberToGroup = useCallback(async (userId: string) => {
    if (!selectedGroupId) return;
    await handleAssignMemberToGroup(userId, selectedGroupId);
  }, [handleAssignMemberToGroup, selectedGroupId]);

  const handleRemoveMemberFromGroup = useCallback(async (userId: string) => {
    if (!selectedGroupId) return;
    await handleAssignMemberToGroup(userId, null);
  }, [handleAssignMemberToGroup, selectedGroupId]);

  return {
    groups,
    groupsLoading,
    groupsError,
    groupSort,
    setGroupSort,
    groupSearch,
    setGroupSearch,
    selectedGroupId,
    setSelectedGroupId,
    groupMembers,
    groupMembersLoading,
    groupMembersError,
    newGroupName,
    setNewGroupName,
    creatingGroup,
    setCreatingGroup,
    groupActionLoading,
    editingGroupId,
    setEditingGroupId,
    editingGroupName,
    setEditingGroupName,
    selectedGroup,
    sortedGroups,
    handleCreateGroup,
    handleStartEditGroup,
    handleSaveGroupName,
    handleDeleteGroup,
    handleAssignMemberToGroup,
    handleAddMemberToGroup,
    handleRemoveMemberFromGroup,
  };
}
