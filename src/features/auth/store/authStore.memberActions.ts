import { supabase } from '@/shared/lib/supabaseClient';
import { workspaceSyncService } from '@/application/workspace/workspaceSyncService';
import { INVITE_ACTIONS } from '@/shared/contracts/actions';
import { invokeInviteFunction } from '@/infrastructure/auth/functionsGateway';
import {
  fetchWorkspaceGroupNameMap,
  listWorkspaceMemberActivity as listWorkspaceMemberActivityFromApi,
  recordWorkspaceMemberActivity,
} from '@/infrastructure/workspace/memberActivityRepository';
import { buildWorkspaceMemberActivityTargetLabel } from '@/shared/domain/workspaceMemberActivity';
import type {
  AuthGetState,
  AuthSetState,
  AuthState,
  InviteDelivery,
  WorkspaceMember,
  WorkspaceMemberProfileRow,
  WorkspaceRole,
} from '@/features/auth/store/authStore.contract';
import {
  fetchWorkspaceMemberSnapshot,
  getWorkspaceActivityActorSnapshot,
  parseSentInvites,
} from '@/features/auth/store/authStore.helpers';

// Members of the current workspace: invites, roles, groups, leaving and
// handing over ownership.
type MemberActions = Pick<
  AuthState,
  | 'fetchMembers'
  | 'inviteMember'
  | 'listSentInvites'
  | 'cancelSentInvite'
  | 'acceptInvite'
  | 'listWorkspaceMemberActivity'
  | 'updateMemberRole'
  | 'updateMemberGroup'
  | 'removeMember'
  | 'leaveWorkspace'
  | 'transferWorkspaceOwnership'
>;

export const createMemberActions = (
  set: AuthSetState,
  get: AuthGetState,
): MemberActions => ({
  fetchMembers: async (workspaceId) => {
    const targetWorkspaceId = workspaceId ?? get().currentWorkspaceId;
    if (!targetWorkspaceId) return;
    set((state) => ({
      membersLoading: true,
      members: state.membersWorkspaceId === targetWorkspaceId ? state.members : [],
      membersWorkspaceId: state.membersWorkspaceId === targetWorkspaceId
        ? state.membersWorkspaceId
        : null,
    }));

    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id, role, group_id, profiles(email, display_name, avatar_url, status)')
      .eq('workspace_id', targetWorkspaceId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(error);
      if (get().currentWorkspaceId !== targetWorkspaceId) return;
      set({
        members: [],
        membersWorkspaceId: null,
        membersLoading: false,
      });
      return;
    }

    const rows = (data ?? []) as unknown as WorkspaceMemberProfileRow[];
    const members: WorkspaceMember[] = rows.map((row) => ({
      userId: row.user_id,
      role: row.role as WorkspaceRole,
      email: row.profiles?.email ?? 'unknown',
      displayName: row.profiles?.display_name ?? null,
      groupId: row.group_id ?? null,
      avatarUrl: row.profiles?.avatar_url ?? null,
      status: row.profiles?.status ?? 'ACTIVE',
    }));

    if (get().currentWorkspaceId !== targetWorkspaceId) return;

    set({
      members,
      membersWorkspaceId: targetWorkspaceId,
      membersLoading: false,
    });
  },
  inviteMember: async (email, role, groupId = null) => {
    const workspaceId = get().currentWorkspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { data, error } = await invokeInviteFunction<{
      actionLink?: string;
      warning?: string;
      inviteEmail?: string;
      inviteStatus?: string;
      delivery?: InviteDelivery;
      inviteToken?: string;
      alreadyMember?: boolean;
    }>({
      action: INVITE_ACTIONS.CREATE,
      workspaceId,
      email,
      role,
      groupId,
    });
    if (error) {
      // On any error path the gateway never returns `data`, so these fields are
      // always undefined here. Spelled out explicitly (instead of data?.x) to keep
      // the exact same result shape while satisfying strict null checks.
      return {
        error,
        actionLink: undefined,
        warning: undefined,
        inviteEmail: undefined,
        inviteStatus: undefined,
      };
    }

    if (data?.inviteStatus === 'pending') {
      const { actorUserId, actorLabel } = getWorkspaceActivityActorSnapshot(get());
      const { groupNameById } = await fetchWorkspaceGroupNameMap(workspaceId, [groupId]);
      const logResult = await recordWorkspaceMemberActivity({
        workspaceId,
        action: 'invite_created',
        actorUserId,
        actorLabel,
        targetLabel: buildWorkspaceMemberActivityTargetLabel(null, data?.inviteEmail ?? email.trim()),
        targetEmail: data?.inviteEmail ?? email.trim(),
        details: {
          inviteRole: role,
          inviteGroupName: groupId ? (groupNameById.get(groupId) ?? null) : null,
        },
      });
      if (logResult.error) {
        console.error(logResult.error);
      }
    }

    return {
      actionLink: data?.actionLink,
      warning: data?.warning,
      inviteEmail: data?.inviteEmail,
      inviteStatus: data?.inviteStatus,
      delivery: data?.delivery,
      inviteToken: data?.inviteToken,
      alreadyMember: data?.alreadyMember,
    };
  },
  listSentInvites: async (options) => {
    const { data, error } = await invokeInviteFunction<{ invites?: unknown }>({
      action: INVITE_ACTIONS.LIST_SENT,
      pendingOnly: options?.pendingOnly,
    });
    if (error) return { invites: [], error };

    const targetWorkspaceId = options?.workspaceId ?? get().currentWorkspaceId;
    const invites = parseSentInvites(data?.invites).filter((invite) => (
      targetWorkspaceId ? invite.workspaceId === targetWorkspaceId : true
    ));
    return { invites };
  },
  cancelSentInvite: async (token) => {
    const inviteToken = token.trim();
    if (!inviteToken) return { error: 'Invite token is required.' };

    const { error } = await invokeInviteFunction({
      action: INVITE_ACTIONS.CANCEL,
      token: inviteToken,
    });
    if (error) return { error };
    return {};
  },
  acceptInvite: async (token) => {
    const inviteToken = token.trim();
    if (!inviteToken) return { error: 'Invite token is required.' };

    const { data, error } = await invokeInviteFunction<{
      workspaceId?: string;
      warning?: string;
    }>({
      action: INVITE_ACTIONS.ACCEPT,
      token: inviteToken,
    });
    if (error) return { error };

    return {
      workspaceId: data?.workspaceId,
      warning: data?.warning,
    };
  },
  listWorkspaceMemberActivity: async (options) => {
    const workspaceId = options?.workspaceId ?? get().currentWorkspaceId;
    if (!workspaceId) return { entries: [], error: 'Workspace not selected.' };
    return listWorkspaceMemberActivityFromApi(workspaceId, { limit: options?.limit });
  },
  updateMemberRole: async (userId, role) => {
    const workspaceId = get().currentWorkspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };
    const currentMember = get().members.find((member) => member.userId === userId)
      ?? (await fetchWorkspaceMemberSnapshot(workspaceId, userId)).member;

    const { error } = await supabase
      .from('workspace_members')
      .update({ role })
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);

    if (error) {
      return { error: error.message };
    }

    await get().fetchMembers(workspaceId);
    await workspaceSyncService.refreshAssignees();

    if (currentMember && currentMember.role !== role) {
      const { actorUserId, actorLabel } = getWorkspaceActivityActorSnapshot(get());
      const logResult = await recordWorkspaceMemberActivity({
        workspaceId,
        action: 'member_role_changed',
        actorUserId,
        actorLabel,
        targetUserId: currentMember.userId,
        targetLabel: buildWorkspaceMemberActivityTargetLabel(currentMember.displayName, currentMember.email),
        targetEmail: currentMember.email,
        details: {
          previousRole: currentMember.role,
          nextRole: role,
        },
      });
      if (logResult.error) {
        console.error(logResult.error);
      }
    }

    return {};
  },
  updateMemberGroup: async (userId, groupId) => {
    const workspaceId = get().currentWorkspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };
    const currentMember = get().members.find((member) => member.userId === userId)
      ?? (await fetchWorkspaceMemberSnapshot(workspaceId, userId)).member;
    const { groupNameById, error: groupNamesError } = await fetchWorkspaceGroupNameMap(
      workspaceId,
      [currentMember?.groupId, groupId],
    );
    if (groupNamesError) {
      console.error(groupNamesError);
    }

    const { error } = await supabase
      .from('workspace_members')
      .update({ group_id: groupId })
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);

    if (error) {
      return { error: error.message };
    }

    await get().fetchMembers(workspaceId);
    await workspaceSyncService.refreshMemberGroups();

    if (currentMember && currentMember.groupId !== groupId) {
      const { actorUserId, actorLabel } = getWorkspaceActivityActorSnapshot(get());
      const logResult = await recordWorkspaceMemberActivity({
        workspaceId,
        action: 'member_group_changed',
        actorUserId,
        actorLabel,
        targetUserId: currentMember.userId,
        targetLabel: buildWorkspaceMemberActivityTargetLabel(currentMember.displayName, currentMember.email),
        targetEmail: currentMember.email,
        details: {
          previousGroupName: currentMember.groupId
            ? (groupNameById.get(currentMember.groupId) ?? null)
            : null,
          nextGroupName: groupId ? (groupNameById.get(groupId) ?? null) : null,
        },
      });
      if (logResult.error) {
        console.error(logResult.error);
      }
    }

    return {};
  },
  removeMember: async (userId) => {
    const workspaceId = get().currentWorkspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };
    const currentUserId = get().user?.id;
    if (currentUserId && currentUserId === userId) {
      return { error: 'You cannot remove yourself.' };
    }

    if (!currentUserId) {
      return { error: 'Access denied' };
    }

    const currentMember = get().members.find((member) => member.userId === userId)
      ?? (await fetchWorkspaceMemberSnapshot(workspaceId, userId)).member;

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .single();

    if (workspaceError) {
      return { error: workspaceError.message };
    }

    if (workspace?.owner_id !== currentUserId) {
      return { error: 'Access denied' };
    }

    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);

    if (error) {
      return { error: error.message };
    }

    await get().fetchMembers(workspaceId);
    await workspaceSyncService.refreshMemberGroups();

    if (currentMember) {
      const { actorUserId, actorLabel } = getWorkspaceActivityActorSnapshot(get());
      const logResult = await recordWorkspaceMemberActivity({
        workspaceId,
        action: 'member_removed',
        actorUserId,
        actorLabel,
        targetUserId: currentMember.userId,
        targetLabel: buildWorkspaceMemberActivityTargetLabel(currentMember.displayName, currentMember.email),
        targetEmail: currentMember.email,
      });
      if (logResult.error) {
        console.error(logResult.error);
      }
    }

    return {};
  },
  leaveWorkspace: async (workspaceId) => {
    const targetWorkspaceId = workspaceId || get().currentWorkspaceId;
    if (!targetWorkspaceId) return { error: 'Workspace not selected.' };

    const { error } = await supabase.rpc('leave_workspace', { p_workspace_id: targetWorkspaceId });
    if (error) {
      if (error.message.includes('OWNER_MUST_TRANSFER_FIRST')) {
        return { error: error.message, reason: 'OWNER_MUST_TRANSFER_FIRST' };
      }
      if (error.message.includes('SOLE_ADMIN_MUST_PROMOTE_FIRST')) {
        return { error: error.message, reason: 'SOLE_ADMIN_MUST_PROMOTE_FIRST' };
      }
      return { error: error.message };
    }

    // The current workspace no longer includes us; fetchWorkspaces switches away.
    await get().fetchWorkspaces();
    return {};
  },
  transferWorkspaceOwnership: async (workspaceId, newOwnerId) => {
    const targetWorkspaceId = workspaceId || get().currentWorkspaceId;
    if (!targetWorkspaceId) return { error: 'Workspace not selected.' };
    if (!newOwnerId) return { error: 'Select a new owner.' };

    const { error } = await supabase.rpc('transfer_workspace_ownership', {
      p_workspace_id: targetWorkspaceId,
      p_new_owner_id: newOwnerId,
    });
    if (error) return { error: error.message };

    await get().fetchWorkspaces();
    await get().fetchMembers(targetWorkspaceId);
    return {};
  },
});
