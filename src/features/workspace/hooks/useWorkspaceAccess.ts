import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { t } from '@lingui/macro';
import { useAuthStore, type WorkspaceRole } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { splitMembersByAccess } from '@/shared/domain/workspaceMemberAccess';
import type { WorkspaceMemberActivityEntry } from '@/shared/domain/workspaceMemberActivity';

export type AccessGroup = {
  id: string;
  name: string;
};

/** A workspace member as the access screens read them. */
export type AccessMember = {
  userId: string;
  email: string;
  displayName: string | null;
  role: WorkspaceRole;
  groupId: string | null;
  avatarUrl: string | null;
  status: string;
};

export type SentInvite = {
  token: string;
  workspaceId: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired';
  isPending: boolean;
  createdAt: string | null;
};

/**
 * Everything the access screens need about the people in a workspace: who is
 * in, what they may do, which invites are out, and what changed lately.
 *
 * Kept apart from any one screen because the phone reaches this through four
 * screens where the desktop uses a single panel — the two must not drift into
 * separate ideas of what "remove a member" does.
 */
export const useWorkspaceAccess = ({ active = true }: { active?: boolean } = {}) => {
  const {
    user,
    workspaces,
    members,
    membersLoading,
    fetchMembers,
    inviteMember,
    listSentInvites,
    cancelSentInvite,
    listWorkspaceMemberActivity,
    updateMemberRole,
    updateMemberGroup,
    removeMember,
    leaveWorkspace,
    transferWorkspaceOwnership,
    renamePurgedProfile,
    currentWorkspaceId,
    currentWorkspaceRole,
  } = useAuthStore(useShallow((state) => ({
    user: state.user,
    workspaces: state.workspaces,
    members: state.members,
    membersLoading: state.membersLoading,
    fetchMembers: state.fetchMembers,
    inviteMember: state.inviteMember,
    listSentInvites: state.listSentInvites,
    cancelSentInvite: state.cancelSentInvite,
    listWorkspaceMemberActivity: state.listWorkspaceMemberActivity,
    updateMemberRole: state.updateMemberRole,
    updateMemberGroup: state.updateMemberGroup,
    removeMember: state.removeMember,
    leaveWorkspace: state.leaveWorkspace,
    transferWorkspaceOwnership: state.transferWorkspaceOwnership,
    renamePurgedProfile: state.renamePurgedProfile,
    currentWorkspaceId: state.currentWorkspaceId,
    currentWorkspaceRole: state.currentWorkspaceRole,
  })));

  const {
    assignees,
    refreshAssignees,
    updateAssignee,
    setWorkspaceId,
    fetchMemberGroups,
  } = usePlannerStore(useShallow((state) => ({
    assignees: state.assignees,
    refreshAssignees: state.refreshAssignees,
    updateAssignee: state.updateAssignee,
    setWorkspaceId: state.setWorkspaceId,
    fetchMemberGroups: state.fetchMemberGroups,
  })));

  const isAdmin = currentWorkspaceRole === 'admin';
  const currentUserId = user?.id ?? null;
  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null,
    [currentWorkspaceId, workspaces],
  );
  const ownerId = currentWorkspace?.ownerId ?? null;
  const isWorkspaceOwner = Boolean(currentUserId && ownerId === currentUserId);

  const [error, setError] = useState('');
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [sentInvitesLoading, setSentInvitesLoading] = useState(false);
  const [activity, setActivity] = useState<WorkspaceMemberActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');

  useEffect(() => {
    if (!active || !currentWorkspaceId) return;
    fetchMembers(currentWorkspaceId);
    setWorkspaceId(currentWorkspaceId);
    refreshAssignees();
  }, [active, currentWorkspaceId, fetchMembers, refreshAssignees, setWorkspaceId]);

  useEffect(() => {
    if (!active || !currentWorkspaceId) return;
    let mounted = true;
    setGroupsLoading(true);
    fetchMemberGroups(currentWorkspaceId).then((result) => {
      if (!mounted) return;
      if (result.error) {
        setError(result.error);
      } else {
        setGroups(result.groups as AccessGroup[]);
      }
      setGroupsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [active, currentWorkspaceId, fetchMemberGroups]);

  const loadInvites = useCallback(async () => {
    if (!active || !isAdmin || !currentWorkspaceId) {
      setSentInvites([]);
      return;
    }
    setSentInvitesLoading(true);
    const { invites, error: invitesError } = await listSentInvites({
      workspaceId: currentWorkspaceId,
      pendingOnly: true,
    });
    if (invitesError) {
      setError(invitesError);
      setSentInvitesLoading(false);
      return;
    }
    setSentInvites(invites as SentInvite[]);
    setSentInvitesLoading(false);
  }, [active, currentWorkspaceId, isAdmin, listSentInvites]);

  const loadActivity = useCallback(async () => {
    if (!active || !isAdmin || !currentWorkspaceId) {
      setActivity([]);
      return;
    }
    setActivityLoading(true);
    setActivityError('');
    const { entries, error: entriesError } = await listWorkspaceMemberActivity({
      workspaceId: currentWorkspaceId,
      limit: 100,
    });
    if (entriesError) {
      setActivityError(entriesError);
      setActivityLoading(false);
      return;
    }
    setActivity(entries);
    setActivityLoading(false);
  }, [active, currentWorkspaceId, isAdmin, listWorkspaceMemberActivity]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const assigneeByUserId = useMemo(() => {
    const map = new Map<string, typeof assignees[number]>();
    assignees.forEach((assignee) => {
      if (assignee.userId) map.set(assignee.userId, assignee);
    });
    return map;
  }, [assignees]);

  const groupNameById = useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups],
  );

  const { active: activeMembers, disabled: disabledMembers } = useMemo(
    () => splitMembersByAccess(members, assigneeByUserId),
    [assigneeByUserId, members],
  );

  const pendingInvites = useMemo(
    () => [...sentInvites]
      .filter((invite) => invite.isPending)
      .sort((left, right) => {
        const leftAt = left.createdAt ? Date.parse(left.createdAt) : 0;
        const rightAt = right.createdAt ? Date.parse(right.createdAt) : 0;
        return rightAt - leftAt;
      }),
    [sentInvites],
  );

  const changeRole = useCallback(async (userId: string, role: WorkspaceRole) => {
    if (!isAdmin) return;
    const result = await updateMemberRole(userId, role);
    if (result.error) {
      setError(result.error);
      return;
    }
    void loadActivity();
  }, [isAdmin, loadActivity, updateMemberRole]);

  const changeGroup = useCallback(async (userId: string, groupId: string | null) => {
    if (!isAdmin) return;
    const result = await updateMemberGroup(userId, groupId);
    if (result.error) {
      setError(result.error);
      return;
    }
    void loadActivity();
  }, [isAdmin, loadActivity, updateMemberGroup]);

  const changeStatus = useCallback(async (assigneeId: string, isActive: boolean) => {
    const result = await updateAssignee(assigneeId, { isActive });
    if (result?.error) {
      setError(result.error);
      return;
    }
    void loadActivity();
  }, [loadActivity, updateAssignee]);

  const removeFromWorkspace = useCallback(async (userId: string) => {
    const result = await removeMember(userId);
    if (result.error) {
      setError(result.error);
      return;
    }
    void loadActivity();
  }, [loadActivity, removeMember]);

  const leave = useCallback(async () => {
    if (!currentWorkspaceId) return;
    const result = await leaveWorkspace(currentWorkspaceId);
    if (result.error) {
      setError(
        result.reason === 'SOLE_ADMIN_MUST_PROMOTE_FIRST'
          ? t`You are the only admin. Promote another member to admin before leaving.`
          : result.error,
      );
    }
  }, [currentWorkspaceId, leaveWorkspace]);

  const invite = useCallback(async (
    email: string,
    role: WorkspaceRole,
    groupId: string | null,
  ) => {
    const result = await inviteMember(email, role, groupId);
    if (result.error) {
      setError(result.error);
      return { error: result.error };
    }
    void loadInvites();
    void loadActivity();
    return {
      email: result.inviteEmail ?? email,
      status: result.inviteStatus ?? 'pending',
      warning: result.warning ?? null,
    };
  }, [inviteMember, loadActivity, loadInvites]);

  const revokeInvite = useCallback(async (token: string) => {
    const { error: revokeError } = await cancelSentInvite(token);
    if (revokeError) {
      setError(revokeError);
      return;
    }
    await loadInvites();
  }, [cancelSentInvite, loadInvites]);

  const renamePurged = useCallback(async (userId: string, name: string) => {
    const result = await renamePurgedProfile(userId, name);
    return result.error ? { error: result.error } : {};
  }, [renamePurgedProfile]);

  return {
    currentUserId,
    currentWorkspaceId,
    isAdmin,
    isWorkspaceOwner,
    ownerId,
    members,
    membersLoading,
    activeMembers,
    disabledMembers,
    assigneeByUserId,
    groups,
    groupsLoading,
    groupNameById,
    pendingInvites,
    sentInvitesLoading,
    activity,
    activityLoading,
    activityError,
    error,
    setError,
    changeRole,
    changeGroup,
    changeStatus,
    removeFromWorkspace,
    leave,
    invite,
    revokeInvite,
    renamePurged,
    transferWorkspaceOwnership,
  };
};
