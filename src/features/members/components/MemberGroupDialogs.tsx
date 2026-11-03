import React from 'react';
import { t } from '@lingui/macro';
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
import { AssignGroupDialog } from '@/features/members/components/AssignGroupDialog';
import type { MemberGroupFlow } from '@/features/members/hooks/useMemberGroupFlow';

interface MemberGroupDialogsProps {
  flow: MemberGroupFlow;
  groups: React.ComponentProps<typeof AssignGroupDialog>['groups'];
  loading: boolean;
  isMobile: boolean;
}

/** Pick a group, confirm leaving a group, confirm deleting a group. */
export const MemberGroupDialogs: React.FC<MemberGroupDialogsProps> = ({ flow, groups, loading, isMobile }) => {
  const {
    groupAssignTarget,
    setGroupAssignTarget,
    handleGroupSelected,
    groupRemoveTarget,
    setGroupRemoveTarget,
    confirmGroupRemoval,
    groupDeleteTarget,
    setGroupDeleteTarget,
    confirmGroupDeletion,
  } = flow;

  return (
    <>
    <AssignGroupDialog
      open={groupAssignTarget !== null}
      onOpenChange={(next) => {
        if (!next) setGroupAssignTarget(null);
      }}
      memberName={groupAssignTarget?.name ?? ''}
      groups={groups}
      currentGroupId={groupAssignTarget?.currentGroupId ?? null}
      onSelect={handleGroupSelected}
      loading={loading}
      isMobile={isMobile}
    />

    <AlertDialog
      open={groupRemoveTarget !== null}
      onOpenChange={(next) => {
        if (!next) setGroupRemoveTarget(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Remove from group?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {groupRemoveTarget?.groupName
              ? t`${groupRemoveTarget.name} leaves "${groupRemoveTarget.groupName}" and ends up without a group. Their tasks are not affected.`
              : t`They end up without a group. Their tasks are not affected.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              confirmGroupRemoval();
            }}
          >
            {t`Remove`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog
      open={groupDeleteTarget !== null}
      onOpenChange={(next) => {
        if (!next) setGroupDeleteTarget(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Delete group?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {t`"${groupDeleteTarget?.name ?? ''}" disappears from the workspace. The people in it stay, just without a group.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              confirmGroupDeletion();
            }}
          >
            {t`Delete`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};
