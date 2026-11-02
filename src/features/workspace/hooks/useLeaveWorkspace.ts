import { useState } from 'react';
import { t } from '@lingui/macro';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/features/auth/store/authStore';
import type { WorkspaceMemberSummary } from '@/features/workspace/components/WorkspaceMemberRow';

interface UseLeaveWorkspaceOptions {
  currentWorkspaceId: string | null;
  isWorkspaceOwner: boolean;
  /** The panel's error banner. */
  setError: (message: string) => void;
  /** After a member was removed — the panel refreshes its activity log. */
  onMemberRemoved: () => void;
}

/**
 * Leaving the workspace (an owner hands ownership over first) and removing
 * someone from it, each behind a confirmation.
 */
export const useLeaveWorkspace = ({
  currentWorkspaceId,
  isWorkspaceOwner,
  setError,
  onMemberRemoved,
}: UseLeaveWorkspaceOptions) => {
  const { leaveWorkspace, removeMember, transferWorkspaceOwnership } = useAuthStore(useShallow((state) => ({
    leaveWorkspace: state.leaveWorkspace,
    removeMember: state.removeMember,
    transferWorkspaceOwnership: state.transferWorkspaceOwnership,
  })));
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<WorkspaceMemberSummary | null>(null);

  const handleLeave = () => {
    if (!currentWorkspaceId) return;
    setError('');
    setLeaveError('');
    if (isWorkspaceOwner) {
      // The owner cannot leave directly — they must transfer ownership first
      // (or delete the workspace if they are the only member).
      setTransferTargetId('');
      setLeaveDialogOpen(true);
      return;
    }
    setLeaveConfirmOpen(true);
  };

  const confirmLeave = async () => {
    if (!currentWorkspaceId) return;
    setLeaving(true);
    const result = await leaveWorkspace(currentWorkspaceId);
    setLeaving(false);
    setLeaveConfirmOpen(false);
    if (result.error) {
      setError(
        result.reason === 'SOLE_ADMIN_MUST_PROMOTE_FIRST'
          ? t`You are the only admin. Promote another member to admin before leaving.`
          : result.error,
      );
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const targetId = removeTarget.userId;
    setRemoveTarget(null);
    const result = await removeMember(targetId);
    if (result.error) {
      setError(result.error);
      return;
    }
    onMemberRemoved();
  };

  const handleConfirmTransferAndLeave = async () => {
    if (!currentWorkspaceId || !transferTargetId) return;
    setLeaving(true);
    setLeaveError('');
    const transferResult = await transferWorkspaceOwnership(currentWorkspaceId, transferTargetId);
    if (transferResult.error) {
      setLeaving(false);
      setLeaveError(transferResult.error);
      return;
    }
    const leaveResult = await leaveWorkspace(currentWorkspaceId);
    setLeaving(false);
    if (leaveResult.error) {
      setLeaveError(leaveResult.error);
      return;
    }
    setLeaveDialogOpen(false);
  };

  return {
    leaveDialogOpen,
    setLeaveDialogOpen,
    leaveConfirmOpen,
    setLeaveConfirmOpen,
    transferTargetId,
    setTransferTargetId,
    leaving,
    leaveError,
    setLeaveError,
    removeTarget,
    setRemoveTarget,
    handleLeave,
    confirmLeave,
    confirmRemove,
    handleConfirmTransferAndLeave,
  };
};

export type LeaveWorkspace = ReturnType<typeof useLeaveWorkspace>;
