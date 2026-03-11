import React from 'react';
import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { hasRichTags } from '@/shared/domain/taskDescription';
import { Assignee, Project, Status, Tag, Task, TaskType } from '@/features/planner/types/planner';

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
  selectedTaskCommentCount: number;
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
  onOpenTaskInTimeline,
  onClose,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[95vw] max-w-2xl">
      <DialogHeader>
        <DialogTitle>{selectedTask?.title ?? t`Task details`}</DialogTitle>
        <DialogDescription className="sr-only">
          {t`View task details without leaving the members page.`}
        </DialogDescription>
      </DialogHeader>
      {!selectedTask && (
        <div className="text-sm text-muted-foreground">{t`Task not found.`}</div>
      )}
      {selectedTask && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">{t`Project`}</div>
              <div className="text-sm">
                {selectedTaskProject
                  ? formatProjectLabel(selectedTaskProject.name, selectedTaskProject.code)
                  : t`No project`}
              </div>
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
            <div>
              <div className="text-xs text-muted-foreground">{t`Comments`}</div>
              <div className="flex items-center gap-2">
                <Badge variant={selectedTaskCommentCount > 0 ? 'secondary' : 'outline'} className="min-w-8 justify-center text-[10px]">
                  {selectedTaskCommentCount}
                </Badge>
                {selectedTaskCommentCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {selectedTaskCommentCount === 1 ? t`1 comment` : t`${selectedTaskCommentCount} comments`}
                  </span>
                )}
              </div>
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
            {selectedTask.description && hasRichTags(selectedTask.description) && (
              <div
                className="text-sm leading-6"
                dangerouslySetInnerHTML={{ __html: selectedTaskDescription }}
              />
            )}
            {selectedTask.description && !hasRichTags(selectedTask.description) && (
              <div className="text-sm whitespace-pre-wrap">{selectedTaskDescription}</div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={onOpenTaskInTimeline}>
              {t`Go to task`}
            </Button>
            <Button variant="outline" onClick={onClose}>
              {t`Close`}
            </Button>
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>
);
