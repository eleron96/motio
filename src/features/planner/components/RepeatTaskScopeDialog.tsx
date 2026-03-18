import React from 'react';
import { t } from '@lingui/macro';
import { RepeatTaskUpdateScope } from '@/features/planner/types/planner';
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

type RepeatTaskScopeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onApply: (scope: RepeatTaskUpdateScope) => Promise<void> | void;
};

export const RepeatTaskScopeDialog = ({
  open,
  onOpenChange,
  onCancel,
  onApply,
}: RepeatTaskScopeDialogProps) => (
  <AlertDialog
    open={open}
    onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onCancel();
        return;
      }
      onOpenChange(true);
    }}
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t`Apply changes to repeating tasks?`}</AlertDialogTitle>
        <AlertDialogDescription>
          {t`Choose where to apply this change.`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="flex-row flex-wrap items-center justify-between gap-2 sm:justify-between sm:space-x-0">
        <AlertDialogCancel className="mt-0 h-8 px-2.5 text-xs" onClick={onCancel}>
          {t`Cancel`}
        </AlertDialogCancel>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <AlertDialogAction
            className="h-8 whitespace-nowrap bg-muted px-2.5 text-xs text-foreground hover:bg-muted/80"
            onClick={() => {
              void onApply('all');
            }}
          >
            {t`All tasks`}
          </AlertDialogAction>
          <AlertDialogAction
            className="h-8 whitespace-nowrap bg-muted px-2.5 text-xs text-foreground hover:bg-muted/80"
            onClick={() => {
              void onApply('following');
            }}
          >
            {t`This and following`}
          </AlertDialogAction>
          <AlertDialogAction
            className="h-8 whitespace-nowrap px-2.5 text-xs"
            onClick={() => {
              void onApply('single');
            }}
          >
            {t`Only this task`}
          </AlertDialogAction>
        </div>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
