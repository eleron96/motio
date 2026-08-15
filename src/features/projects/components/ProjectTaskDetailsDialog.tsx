import React from 'react';
import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import { Repeat } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import {
  formatRepeatCadenceLabel,
  formatRepeatSeriesRemainderLabel,
} from '@/shared/lib/repeatLabels';
import { hasRichTags } from '@/shared/domain/taskDescription';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';
import { Assignee, Customer, Project, Status, Tag, Task, TaskType } from '@/features/planner/types/planner';

type ProjectTaskDetailsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTask: Task | null;
  selectedTaskProject: Project | null;
  selectedTaskCustomer: Customer | null;
  selectedTaskRepeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
  statusById: Map<string, Status>;
  assigneeById: Map<string, Assignee>;
  taskTypeById: Map<string, TaskType>;
  selectedTaskTags: Tag[];
  selectedTaskDescription: string;
  onGoToTask: () => void;
  onClose: () => void;
};

export const ProjectTaskDetailsDialog: React.FC<ProjectTaskDetailsDialogProps> = ({
  open,
  onOpenChange,
  selectedTask,
  selectedTaskProject,
  selectedTaskCustomer,
  selectedTaskRepeatMeta,
  statusById,
  assigneeById,
  taskTypeById,
  selectedTaskTags,
  selectedTaskDescription,
  onGoToTask,
  onClose,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    {/* The card is capped and scrolls inside. Without the cap a long description
        grew it past both edges of a centred, non-scrolling overlay, so the end of
        the text and both buttons became unreachable. */}
    <DialogContent className="flex max-h-[85svh] w-[95vw] max-w-2xl flex-col overflow-hidden">
      {/* pr-8 keeps a long title clear of the close button in the corner. */}
      <DialogHeader className="shrink-0 pr-8">
        <DialogTitle className="flex items-start gap-2">
          {selectedTaskRepeatMeta && (
            <Repeat
              className="mt-1 h-4 w-4 flex-shrink-0 text-primary/70"
              aria-label={formatRepeatCadenceLabel(selectedTaskRepeatMeta.cadence)}
            />
          )}
          <span>{selectedTask?.title ?? t`Task details`}</span>
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t`View task details linked to this project.`}
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
            data-testid="project-task-details-scroll"
            className="-mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted-foreground">{t`Project`}</div>
                <div className="text-sm">
                  {selectedTaskProject
                    ? formatProjectLabel(selectedTaskProject.name, selectedTaskProject.code)
                    : t`No project`}
                </div>
                {selectedTaskProject && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t`Customer:`} {selectedTaskCustomer?.name ?? t`No customer`}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t`Status`}</div>
                <div className="text-sm">
                  {statusById.get(selectedTask.statusId)
                    ? formatStatusLabel(
                      statusById.get(selectedTask.statusId)!.name,
                      statusById.get(selectedTask.statusId)!.emoji,
                    )
                    : t`Unknown`}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t`Assignees`}</div>
                <div className="flex flex-wrap gap-1">
                  {selectedTask.assigneeIds.length === 0 && (
                    <span className="text-xs text-muted-foreground">{t`Unassigned`}</span>
                  )}
                  {selectedTask.assigneeIds.map((id) => {
                    const assignee = assigneeById.get(id);
                    if (!assignee) return null;
                    return (
                      <Badge key={assignee.id} variant="secondary" className="text-[10px]">
                        {assignee.name}
                        {!assignee.isActive && ` ${t`(disabled)`}`}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t`Dates`}</div>
                <div className="text-sm text-muted-foreground">
                  {format(parseISO(selectedTask.startDate), 'dd MMM yyyy')} – {format(parseISO(selectedTask.endDate), 'dd MMM yyyy')}
                </div>
              </div>
              {selectedTaskRepeatMeta && (
                <div>
                  <div className="text-xs text-muted-foreground">{t`Repeat`}</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Repeat className="h-3 w-3" />
                      {formatRepeatCadenceLabel(selectedTaskRepeatMeta.cadence)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t`${selectedTaskRepeatMeta.total} in series`} · {formatRepeatSeriesRemainderLabel(selectedTaskRepeatMeta.remaining)}
                    </span>
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-muted-foreground">{t`Type`}</div>
                <div className="text-sm">
                  {taskTypeById.get(selectedTask.typeId)?.name ?? t`Unknown`}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{t`Priority`}</div>
                <div className="text-sm">{selectedTask.priority ?? t`None`}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-muted-foreground">{t`Tags`}</div>
                {selectedTaskTags.length === 0 ? (
                  <div className="text-xs text-muted-foreground">{t`No tags`}</div>
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
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t`Description`}</div>
              {!selectedTask.description && (
                <div className="text-sm text-muted-foreground">{t`No description.`}</div>
              )}
              {/* task-description: pasted content (Bitrix screenshots, unbroken
                  runs of text) must wrap and shrink into the column instead of
                  widening it. */}
              {selectedTask.description && hasRichTags(selectedTask.description) && (
                <div
                  className="task-description text-sm leading-6"
                  dangerouslySetInnerHTML={{ __html: selectedTaskDescription }}
                />
              )}
              {selectedTask.description && !hasRichTags(selectedTask.description) && (
                <div className="task-description text-sm whitespace-pre-wrap">{selectedTaskDescription}</div>
              )}
            </div>
          </div>
          {/* Pinned below the scrollport: the buttons stay reachable however long
              the description runs. -mx-6/-mb-6 cancels the card's padding so the
              rule spans its full width. */}
          <div className="-mx-6 -mb-6 flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
            <Button onClick={onGoToTask}>
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
