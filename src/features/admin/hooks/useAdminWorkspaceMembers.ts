import { useCallback, useEffect, useState } from 'react';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import type { WorkspaceRole } from '@/features/auth/store/authStore';

export type AdminWorkspaceMember = {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: WorkspaceRole;
  isOwner: boolean;
  // Put in by a Keycloak group (workspaces from groups).
  viaGroup: boolean;
  joinedAt: string | null;
};

/** Admin → Workspaces → Members: one workspace's people, a role change, a removal. */
export const useAdminWorkspaceMembers = (workspaceId: string | null) => {
  const [members, setMembers] = useState<AdminWorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const result = await invokeAdminFunction<{ members: AdminWorkspaceMember[] }>({
      action: ADMIN_ACTIONS.WORKSPACES_MEMBERS,
      workspaceId,
    });
    setLoading(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setError(null);
    setMembers(result.data.members ?? []);
  }, [workspaceId]);

  useEffect(() => {
    setMembers([]);
    setError(null);
    void load();
  }, [load]);

  const setRole = useCallback(async (userId: string, role: WorkspaceRole) => {
    if (!workspaceId) return { error: 'No workspace.' };
    setBusyUserId(userId);
    const result = await invokeAdminFunction<{ outcome: string }>({
      action: ADMIN_ACTIONS.WORKSPACES_SET_MEMBER_ROLE,
      workspaceId,
      userId,
      role,
    });
    setBusyUserId(null);
    if (result.error !== undefined) return { error: result.error };
    setMembers((current) => current.map((member) => (member.userId === userId ? { ...member, role } : member)));
    return {};
  }, [workspaceId]);

  const remove = useCallback(async (userId: string) => {
    if (!workspaceId) return { error: 'No workspace.' };
    setBusyUserId(userId);
    const result = await invokeAdminFunction<{ outcome: string }>({
      action: ADMIN_ACTIONS.WORKSPACES_REMOVE_MEMBER,
      workspaceId,
      userId,
    });
    setBusyUserId(null);
    if (result.error !== undefined) return { error: result.error };
    setMembers((current) => current.filter((member) => member.userId !== userId));
    return {};
  }, [workspaceId]);

  return { members, loading, error, busyUserId, reload: load, setRole, remove };
};
