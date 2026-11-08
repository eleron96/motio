import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore, type WorkspaceRole } from '@/features/auth/store/authStore';
import { toInviteOutcome, type InviteOutcome } from '@/features/workspace/lib/inviteOutcome';
import { useCopyInviteLink } from '@/features/workspace/hooks/useCopyInviteLink';

export type SentInvite = {
  token: string;
  workspaceId: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired';
  isPending: boolean;
  createdAt: string | null;
};

interface UseWorkspaceInvitesOptions {
  active: boolean;
  isAdmin: boolean;
  isDemo: boolean;
  currentWorkspaceId: string | null;
  /** The panel's error banner, shared with role and status changes. */
  setError: (message: string) => void;
  /** After an invite went out — the panel refreshes its activity log. */
  onInvited: () => void;
  /** In the sandbox an invite turns into the "make it real" offer. */
  openDemoConversion: (reason: 'invite') => void;
}

/** Inviting people to the workspace and the list of invites still pending. */
export const useWorkspaceInvites = ({
  active,
  isAdmin,
  isDemo,
  currentWorkspaceId,
  setError,
  onInvited,
  openDemoConversion,
}: UseWorkspaceInvitesOptions) => {
  const { inviteMember, listSentInvites, cancelSentInvite } = useAuthStore(useShallow((state) => ({
    inviteMember: state.inviteMember,
    listSentInvites: state.listSentInvites,
    cancelSentInvite: state.cancelSentInvite,
  })));
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('viewer');
  const [inviteResult, setInviteResult] = useState<InviteOutcome | null>(null);
  const copyInviteLink = useCopyInviteLink();
  const [submitting, setSubmitting] = useState(false);
  const [cancelingToken, setCancelingToken] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [sentInvitesLoading, setSentInvitesLoading] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState('none');

  const loadSentInvites = useCallback(async () => {
    if (!active || !isAdmin || !currentWorkspaceId) {
      setSentInvites([]);
      setSentInvitesLoading(false);
      return;
    }

    setSentInvitesLoading(true);
    const { invites, error } = await listSentInvites({
      workspaceId: currentWorkspaceId,
      pendingOnly: true,
    });

    if (error) {
      setError(error);
      setSentInvitesLoading(false);
      return;
    }
    setSentInvites(invites as SentInvite[]);
    setSentInvitesLoading(false);
  }, [active, currentWorkspaceId, isAdmin, listSentInvites, setError]);

  useEffect(() => {
    if (!active || !isAdmin || !currentWorkspaceId) {
      setSentInvites([]);
      return;
    }
    void loadSentInvites();
  }, [active, currentWorkspaceId, isAdmin, loadSentInvites]);

  const sentInvitesList = useMemo(
    () => [...sentInvites]
      .filter((invite) => invite.isPending)
      .sort((left, right) => {
      const leftCreatedAt = left.createdAt ? Date.parse(left.createdAt) : 0;
      const rightCreatedAt = right.createdAt ? Date.parse(right.createdAt) : 0;
      return rightCreatedAt - leftCreatedAt;
      }),
    [sentInvites],
  );

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInviteResult(null);
    if (!email.trim()) return;

    if (isDemo) {
      // Sending real invites needs a real account. Convert instead.
      setInviteOpen(false);
      openDemoConversion('invite');
      return;
    }

    const invitedEmail = email.trim();
    setSubmitting(true);
    const result = await inviteMember(
      invitedEmail,
      role,
      inviteGroupId === 'none' ? null : inviteGroupId,
    );
    if (result.error) {
      setError(result.error);
    }
    if (!result.error) {
      setInviteResult(toInviteOutcome(result, invitedEmail));
    }
    setSubmitting(false);
    if (!result.error) {
      setEmail('');
      setRole('viewer');
      setInviteGroupId('none');
      setInviteOpen(false);
      void loadSentInvites();
      onInvited();
    }
  };

  const handleCancelInvite = useCallback(async (token: string) => {
    if (!isAdmin || !token) return;
    setCancelingToken(token);
    setError('');

    const { error } = await cancelSentInvite(token);
    if (error) {
      setError(error);
      setCancelingToken(null);
      return;
    }

    // The notice of this invitation would still offer its link.
    setInviteResult((current) => (current?.token === token ? null : current));
    await loadSentInvites();
    setCancelingToken(null);
  }, [cancelSentInvite, isAdmin, loadSentInvites, setError]);

  const getInviteStatusLabel = (status: SentInvite['status']) => {
    if (status === 'accepted') return t`Accepted`;
    if (status === 'declined') return t`Declined`;
    if (status === 'canceled') return t`Canceled`;
    if (status === 'expired') return t`Expired`;
    return t`Pending`;
  };

  const getInviteStatusClassName = (status: SentInvite['status']) => {
    if (status === 'accepted') return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/20';
    if (status === 'declined' || status === 'canceled' || status === 'expired') {
      return 'bg-muted text-muted-foreground border-border';
    }
    return 'bg-amber-500/15 text-amber-700 border-amber-500/20';
  };

  return {
    email,
    setEmail,
    role,
    setRole,
    inviteResult,
    submitting,
    cancelingToken,
    inviteOpen,
    setInviteOpen,
    sentInvitesList,
    sentInvitesLoading,
    inviteGroupId,
    setInviteGroupId,
    handleInvite,
    handleCancelInvite,
    copyInviteLink,
    getInviteStatusLabel,
    getInviteStatusClassName,
  };
};

export type WorkspaceInvites = ReturnType<typeof useWorkspaceInvites>;
