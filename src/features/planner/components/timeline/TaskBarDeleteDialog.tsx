import React, { useEffect, useMemo, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { Task } from '@/features/planner/types/planner';
import { t } from '@lingui/macro';
import { Checkbox } from '@/shared/ui/checkbox';
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

interface TaskBarDeleteDialogProps {
  task: Task;
  canEdit: boolean;
  rowAssigneeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Delete-confirmation dialog for a task bar.
 *
 * Mounted lazily by TaskBar (only after the user first opens it), so the
 * `tasks` subscription used by the "has future repeats" check and the
 * `assignees` lookup for scoped deletion do not run for every visible bar.
 */
const TaskBarDeleteDialogBase: React.FC<TaskBarDeleteDialogProps> = ({
  task,
  canEdit,
  rowAssigneeId,
  open,
  onOpenChange,
}) => {
  const tasks = usePlannerStore((state) => state.tasks);
  const assignees = usePlannerStore((state) => state.assignees);
  const deleteTask = usePlannerStore((state) => state.deleteTask);
  const deleteTaskSeries = usePlannerStore((state) => state.deleteTaskSeries);
  const removeAssigneeFromTask = usePlannerStore((state) => state.removeAssigneeFromTask);

  const [deleteForRowAssigneeOnly, setDeleteForRowAssigneeOnly] = useState(false);

  const isRepeating = Boolean(task.repeatId);
  const hasFutureRepeats = isRepeating
    ? tasks.some((item) => item.repeatId === task.repeatId && item.startDate > task.startDate)
    : false;

  const scopedAssignee = useMemo(() => {
    if (!rowAssigneeId) return null;
    if (!task.assigneeIds.includes(rowAssigneeId)) return null;
    return assignees.find((assignee) => assignee.id === rowAssigneeId) ?? null;
  }, [assignees, rowAssigneeId, task.assigneeIds]);
  const scopedDeleteAvailable = Boolean(scopedAssignee);
  const scopedAssigneeName = scopedAssignee?.name ?? t`Unknown user`;

  useEffect(() => {
    if (!open) {
      setDeleteForRowAssigneeOnly(false);
    }
  }, [open, task.id]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isRepeating ? t`Delete repeated task?` : t`Delete task?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteForRowAssigneeOnly && scopedDeleteAvailable
              ? (isRepeating
                ? t`Remove "${scopedAssigneeName}" from this task or from this and following repeats.`
                : t`Remove "${scopedAssigneeName}" from this task only.`)
              : (isRepeating
                ? (hasFutureRepeats
                  ? t`Delete only this task or this and future repeats? Previous repeats stay.`
                  : t`Delete only this task or this and subsequent repeats? Previous repeats stay.`)
                : t`This will permanently delete "${task.title}".`)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {scopedDeleteAvailable && (
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Checkbox
              checked={deleteForRowAssigneeOnly}
              onCheckedChange={(value) => setDeleteForRowAssigneeOnly(value === true)}
            />
            <span>{t`Only for ${scopedAssigneeName}`}</span>
          </label>
        )}
        <AlertDialogFooter className="flex-row flex-wrap items-center justify-end gap-2 sm:space-x-0">
          <AlertDialogCancel className="mt-0 h-8 px-2.5 text-xs">{t`Cancel`}</AlertDialogCancel>
          {isRepeating ? (
            <>
              <AlertDialogAction
                className="h-8 whitespace-nowrap bg-muted px-2.5 text-xs text-foreground hover:bg-muted/80"
                onClick={async () => {
                  if (!canEdit) return;
                  if (deleteForRowAssigneeOnly && scopedAssignee) {
                    await removeAssigneeFromTask(task.id, scopedAssignee.id, 'single');
                  } else {
                    await deleteTask(task.id);
                  }
                  onOpenChange(false);
                }}
              >
                {t`Delete this`}
              </AlertDialogAction>
              <AlertDialogAction
                className="h-8 whitespace-nowrap bg-destructive px-2.5 text-xs text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!canEdit || !task.repeatId) return;
                  if (deleteForRowAssigneeOnly && scopedAssignee) {
                    await removeAssigneeFromTask(task.id, scopedAssignee.id, 'following');
                  } else {
                    await deleteTaskSeries(task.repeatId, task.startDate);
                  }
                  onOpenChange(false);
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
                if (deleteForRowAssigneeOnly && scopedAssignee) {
                  await removeAssigneeFromTask(task.id, scopedAssignee.id, 'single');
                } else {
                  await deleteTask(task.id);
                }
                onOpenChange(false);
              }}
            >
              {t`Delete`}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const TaskBarDeleteDialog = React.memo(TaskBarDeleteDialogBase);
TaskBarDeleteDialog.displayName = 'TaskBarDeleteDialog';
