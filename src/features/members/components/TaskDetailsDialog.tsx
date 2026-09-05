import React from 'react';
import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Checkbox } from '@/shared/ui/checkbox';
import { cn } from '@/shared/lib/classNames';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { hasRichTags } from '@/shared/domain/taskDescription';
import { Assignee, Project, Status, Tag, Task, TaskSubtask, TaskType } from '@/features/planner/types/planner';

type TaskDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTask: Task | null;
  selectedTaskProject: Project | null;
  statusById: Map<string, Status>;
  assigneeById: Map<string, Assignee>;
  taskTypeById: Map<string, TaskType>;
  selectedTaskTags: Tag[];
  selectedTaskDescription: string;
  selectedTaskCommentCount: number | undefined;
  /** The task's subtasks; `undefined` while they are still loading. */
  selectedTaskSubtasks?: TaskSubtask[];
  onOpenTaskInTimeline: () => void;
  onClose: () => void;
};

export const TaskDetailsDialog: React.FC<TaskDetailsDialogProps> = ({
  open,
  onOpenChange,
  selectedTask,
  selectedTaskProject,
  statusById,
  assigneeById,
  taskTypeById,
  selectedTaskTags,
  selectedTaskDescription,
  selectedTaskCommentCount,
  selectedTaskSubtasks,
  onOpenTaskInTimeline,
  onClose,
}) => {
  const isMobile = useIsMobile();

  const status = selectedTask ? statusById.get(selectedTask.statusId) : null;
  const projectLabel = selectedTaskProject
    ? formatProjectLabel(selectedTaskProject.name, selectedTaskProject.code)
    : t`No project`;
  const statusLabel = status ? formatStatusLabel(status.name, status.emoji) : t`Unknown`;
  const datesLabel = selectedTask
    ? `${format(parseISO(selectedTask.startDate), 'dd MMM yyyy')} – ${format(parseISO(selectedTask.endDate), 'dd MMM yyyy')}`
    : '';
  const typeLabel = selectedTask
    ? (taskTypeById.get(selectedTask.typeId)?.name ?? t`Unknown`)
    : '';
  const assigneeNames = (selectedTask?.assigneeIds ?? [])
    .map((id) => assigneeById.get(id))
    .filter((assignee): assignee is Assignee => Boolean(assignee));
  const commentsLabel = typeof selectedTaskCommentCount === 'number'
    ? String(selectedTaskCommentCount)
    : '...';

  const description = (
    <div>
      <div className="text-xs text-muted-foreground">{t`Description`}</div>
      {!selectedTask?.description && (
        <div className="text-sm text-muted-foreground">{t`No description.`}</div>
      )}
      {/* task-description: pasted content (Bitrix screenshots, unbroken runs of
          text) must wrap and shrink into the column instead of widening it. */}
      {selectedTask?.description && hasRichTags(selectedTask.description) && (
        <div
          className="task-description text-sm leading-6"
          dangerouslySetInnerHTML={{ __html: selectedTaskDescription }}
        />
      )}
      {selectedTask?.description && !hasRichTags(selectedTask.description) && (
        <div className="task-description text-sm whitespace-pre-wrap">{selectedTaskDescription}</div>
      )}
    </div>
  );

  // Read-only mirror of the timeline panel's subtask list: the dialog is a
  // quick look, editing happens after "Go to task".
  const completedSubtasksCount = (selectedTaskSubtasks ?? [])
    .filter((subtask) => subtask.isDone).length;
  const subtasksSection = (
    <div data-testid="task-details-subtasks">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {t`Subtasks`}
        {selectedTaskSubtasks && selectedTaskSubtasks.length > 0 && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold tabular-nums text-secondary-foreground/80">
            {completedSubtasksCount}/{selectedTaskSubtasks.length}
          </span>
        )}
      </div>
      {!selectedTaskSubtasks && (
        <div className="text-sm text-muted-foreground">{t`Loading...`}</div>
      )}
      {selectedTaskSubtasks && selectedTaskSubtasks.length === 0 && (
        <div className="text-sm text-muted-foreground">{t`No subtasks yet.`}</div>
      )}
      {selectedTaskSubtasks && selectedTaskSubtasks.length > 0 && (
        <ul className="mt-1 space-y-1">
          {selectedTaskSubtasks.map((subtask) => (
            <li key={subtask.id} className="flex items-start gap-2.5">
              <Checkbox checked={subtask.isDone} disabled aria-label={subtask.title} />
              <span
                className={cn(
                  'whitespace-pre-wrap break-words text-sm leading-snug [overflow-wrap:anywhere]',
                  subtask.isDone && 'text-muted-foreground line-through',
                )}
              >
                {subtask.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const tagList = selectedTaskTags.length === 0 ? (
    <span className="text-xs text-muted-foreground">{t`No tags`}</span>
  ) : (
    <div className="flex flex-wrap gap-1.5">
      {selectedTaskTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className="text-[10px]"
          style={{ borderColor: tag.color, color: tag.color }}
        >
          {tag.name}
        </Badge>
      ))}
    </div>
  );

  if (isMobile) {
    // A screen, not a card floating over the page: a task's description can run
    // long, and a centred dialog would scroll inside itself on a small screen.
    return (
      <MobileScreenShell
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) onClose();
        }}
        title={selectedTask?.title ?? t`Task details`}
      >
        {!selectedTask ? (
          <p className="text-sm text-muted-foreground">{t`Task not found.`}</p>
        ) : (
          <div className="space-y-4">
            <MobileListGroup>
              <MobileListRow title={t`Project`} value={projectLabel} />
              <MobileListRow title={t`Status`} value={statusLabel} />
              <MobileListRow title={t`Dates`} value={datesLabel} />
              <MobileListRow title={t`Type`} value={typeLabel} />
              <MobileListRow title={t`Priority`} value={selectedTask.priority ?? t`None`} />
              <MobileListRow title={t`Comments`} value={commentsLabel} />
            </MobileListGroup>

            <MobileListGroup title={t`Assignees`}>
              {assigneeNames.length === 0 ? (
                <MobileListRow title={t`Unassigned`} />
              ) : (
                assigneeNames.map((assignee) => (
                  <MobileListRow
                    key={assignee.id}
                    title={assignee.name}
                    value={assignee.isActive ? undefined : t`(disabled)`}
                  />
                ))
              )}
            </MobileListGroup>

            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">{t`Tags`}</div>
              <div className="mt-1.5">{tagList}</div>
            </div>

            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              {description}
            </div>

            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              {subtasksSection}
            </div>

            <Button className="h-12 w-full" onClick={onOpenTaskInTimeline}>
              {t`Go to task`}
            </Button>
          </div>
        )}
      </MobileScreenShell>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The card is capped and scrolls inside. Without the cap a long description
          grew it past both edges of a centred, non-scrolling overlay, so the end of
          the text and both buttons became unreachable. */}
      <DialogContent className="flex max-h-[85svh] w-[95vw] max-w-2xl flex-col overflow-hidden">
        {/* pr-8 keeps a long title clear of the close button in the corner. */}
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{selectedTask?.title ?? t`Task details`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`View task details without leaving the members page.`}
          </DialogDescription>
        </DialogHeader>
        {!selectedTask && (
          <div className="text-sm text-muted-foreground">{t`Task not found.`}</div>
        )}
        {selectedTask && (
          <>
            {/* -mr-2/pr-2: the scrollbar rides the card's edge instead of biting
                into the text column. */}
            <div
              data-testid="task-details-scroll"
              className="-mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">{t`Project`}</div>
                  <div className="text-sm">{projectLabel}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Status`}</div>
                  <div className="text-sm">{statusLabel}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Assignees`}</div>
                  <div className="flex flex-wrap gap-1">
                    {assigneeNames.length === 0 && (
                      <span className="text-xs text-muted-foreground">{t`Unassigned`}</span>
                    )}
                    {assigneeNames.map((assignee) => (
                      <Badge key={assignee.id} variant="secondary" className="text-[10px]">
                        {assignee.name}
                        {!assignee.isActive && ` ${t`(disabled)`}`}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Dates`}</div>
                  <div className="text-sm text-muted-foreground">{datesLabel}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Type`}</div>
                  <div className="text-sm">{typeLabel}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Priority`}</div>
                  <div className="text-sm">{selectedTask.priority ?? t`None`}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t`Comments`}</div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={typeof selectedTaskCommentCount === 'number' && selectedTaskCommentCount > 0 ? 'secondary' : 'outline'}
                      className="min-w-8 justify-center text-[10px]"
                    >
                      {commentsLabel}
                    </Badge>
                    {typeof selectedTaskCommentCount === 'number' && selectedTaskCommentCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {selectedTaskCommentCount === 1 ? t`1 comment` : t`${selectedTaskCommentCount} comments`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">{t`Tags`}</div>
                  {tagList}
                </div>
              </div>
              {description}
              {subtasksSection}
            </div>
            {/* Pinned below the scrollport: the buttons stay reachable however
                long the description runs. -mx-6/-mb-6 cancels the card's padding
                so the rule spans its full width. */}
            <div className="-mx-6 -mb-6 flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
              <Button onClick={onOpenTaskInTimeline}>
                {t`Go to task`}
              </Button>
              <Button variant="outline" onClick={onClose}>
                {t`Close`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
