import React from 'react';
import { t } from '@lingui/macro';
import { RepeatTaskUpdateScope } from '@/features/planner/types/planner';
import { RepeatTaskScopeDialog } from '@/features/planner/components/RepeatTaskScopeDialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
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

type TaskNotFoundDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const TaskNotFoundDialog = ({ open, onOpenChange }: TaskNotFoundDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[90vw] max-w-[420px]">
      <DialogHeader>
        <DialogTitle>{t`Task not found.`}</DialogTitle>
        <DialogDescription>
          {t`The selected task does not exist or was deleted.`}
        </DialogDescription>
      </DialogHeader>
    </DialogContent>
  </Dialog>
);

type TaskDetailAlertsProps = {
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  onDiscardAndClose: () => void;
  onSaveAndClose: () => Promise<void> | void;
  repeatCreating: boolean;
  repeatScopeOpen: boolean;
  setRepeatScopeOpen: (open: boolean) => void;
  repeatScopeOptions?: RepeatTaskUpdateScope[];
  onCancelPendingRepeatUpdate: () => void;
  onApplyPendingRepeatUpdate: (scope: RepeatTaskUpdateScope) => Promise<void> | void;
  deleteOpen: boolean;
  setDeleteOpen: (open: boolean) => void;
  isRepeating: boolean;
  hasFutureRepeats: boolean;
  taskTitle: string;
  canEdit: boolean;
  onDeleteTask: () => Promise<void> | void;
  onDeleteTaskAndFollowing: () => Promise<void> | void;
};

export const TaskDetailAlerts = ({
  confirmOpen,
  setConfirmOpen,
  onDiscardAndClose,
  onSaveAndClose,
  repeatCreating,
  repeatScopeOpen,
  setRepeatScopeOpen,
  repeatScopeOptions,
  onCancelPendingRepeatUpdate,
  onApplyPendingRepeatUpdate,
  deleteOpen,
  setDeleteOpen,
  isRepeating,
  hasFutureRepeats,
  taskTitle,
  canEdit,
  onDeleteTask,
  onDeleteTaskAndFollowing,
}: TaskDetailAlertsProps) => (
  <>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Unsaved changes`}</AlertDialogTitle>
          <AlertDialogDescription>
            {t`You have unsaved changes. Close without saving?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscardAndClose}>{t`Discard`}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              void onSaveAndClose();
            }}
            disabled={repeatCreating}
          >
            {t`Save`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <RepeatTaskScopeDialog
      open={repeatScopeOpen}
      onOpenChange={setRepeatScopeOpen}
      onCancel={onCancelPendingRepeatUpdate}
      onApply={onApplyPendingRepeatUpdate}
      scopes={repeatScopeOptions}
    />

    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isRepeating ? t`Delete repeated task?` : t`Delete task?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {isRepeating
              ? (hasFutureRepeats
                ? t`Delete only this task or this and future repeats? Previous repeats stay.`
                : t`Delete only this task or this and subsequent repeats? Previous repeats stay.`)
              : t`This will permanently delete "${taskTitle}".`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row flex-wrap items-center justify-end gap-2 sm:space-x-0">
          <AlertDialogCancel className="mt-0 h-8 px-2.5 text-xs">{t`Cancel`}</AlertDialogCancel>
          {isRepeating ? (
            <>
              <AlertDialogAction
                className="h-8 whitespace-nowrap bg-muted px-2.5 text-xs text-foreground hover:bg-muted/80"
                onClick={async () => {
                  if (!canEdit) return;
                  await onDeleteTask();
                }}
              >
                {t`Delete this`}
              </AlertDialogAction>
              <AlertDialogAction
                className="h-8 whitespace-nowrap bg-destructive px-2.5 text-xs text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!canEdit) return;
                  await onDeleteTaskAndFollowing();
                }}
              >
                {t`Delete this & following`}
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction
              className="h-8 whitespace-nowrap px-2.5 text-xs"
              onClick={async () => {
                if (!canEdit) return;
                await onDeleteTask();
              }}
            >
              {t`Delete`}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
