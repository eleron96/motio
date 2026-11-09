import { useCallback, useEffect, useState } from 'react';
import { ADMIN_ACTIONS } from '@/shared/contracts/actions';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import type { WorkspaceRole } from '@/features/auth/store/authStore';

export type AdminInvitation = {
  id: string;
  workspaceId: string;
  workspaceName: string | null;
  email: string;
  role: WorkspaceRole;
  token: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  invitedByName: string | null;
};

/** Admin → Invitations: every invitation nobody has answered yet, across workspaces. */
export const useAdminInvitations = () => {
  const [invitations, setInvitations] = useState<AdminInvitation[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await invokeAdminFunction<{ invitations: AdminInvitation[]; truncated: boolean }>({
      action: ADMIN_ACTIONS.INVITES_LIST,
    });
    setLoading(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setError(null);
    setInvitations(result.data.invitations ?? []);
    setTruncated(Boolean(result.data.truncated));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(async (inviteId: string) => {
    setBusyId(inviteId);
    const result = await invokeAdminFunction<{ outcome: string }>({ action: ADMIN_ACTIONS.INVITES_REVOKE, inviteId });
    setBusyId(null);
    if (result.error !== undefined) return { error: result.error };
    setInvitations((current) => current.filter((invitation) => invitation.id !== inviteId));
    return {};
  }, []);

  return { invitations, truncated, loading, error, busyId, refresh: load, revoke };
};
