import React from 'react';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { t } from '@lingui/macro';
import type { LeaveWorkspace } from '@/features/workspace/hooks/useLeaveWorkspace';
import type { WorkspaceMemberSummary } from '@/features/workspace/components/WorkspaceMemberRow';

interface WorkspaceLeaveDialogsProps {
  leave: LeaveWorkspace;
  /** Active members (not you) who can take over ownership. */
  transferCandidates: WorkspaceMemberSummary[];
}

/** Hand over ownership and leave; confirm leaving; confirm removing a member. */
export const WorkspaceLeaveDialogs: React.FC<WorkspaceLeaveDialogsProps> = ({ leave, transferCandidates }) => {
  const {
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
    confirmLeave,
    confirmRemove,
    handleConfirmTransferAndLeave,
  } = leave;

  return (
    <>
      <Dialog
        open={leaveDialogOpen}
        onOpenChange={(next) => {
          if (leaving) return;
          setLeaveDialogOpen(next);
          if (!next) setLeaveError('');
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t`Leave workspace`}</DialogTitle>
            <DialogDescription>
              {t`You are the owner of this workspace. Transfer ownership to another member to leave.`}
            </DialogDescription>
          </DialogHeader>
          {transferCandidates.length === 0 ? (
            <Alert>
              <AlertTitle>{t`You are the only member`}</AlertTitle>
              <AlertDescription>
                {t`There is no one to transfer ownership to. Delete the workspace instead if you no longer need it.`}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              <Label>{t`New owner`}</Label>
              <Select value={transferTargetId} onValueChange={setTransferTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder={t`Select a member`} />
                </SelectTrigger>
                <SelectContent>
                  {transferCandidates.map((candidate) => (
                    <SelectItem key={candidate.userId} value={candidate.userId}>
                      {candidate.displayName || candidate.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {leaveError && <p className="text-sm text-destructive">{leaveError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)} disabled={leaving}>
              {t`Cancel`}
            </Button>
            <Button
              onClick={() => void handleConfirmTransferAndLeave()}
              disabled={leaving || !transferTargetId || transferCandidates.length === 0}
            >
              {t`Transfer & leave`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={leaveConfirmOpen}
        onOpenChange={(next) => {
          if (!leaving) setLeaveConfirmOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Leave workspace?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`You will lose access to this workspace. Your tasks stay and reattach to you if you are invited back.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leaving}>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void confirmLeave();
              }}
              disabled={leaving}
            >
              {t`Leave`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(next) => {
          if (!next) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Remove member?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`They will lose access to this workspace. Tasks already assigned to them are not affected.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-sm font-medium">
            {removeTarget?.displayName || removeTarget?.email}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void confirmRemove();
              }}
            >
              {t`Remove`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
