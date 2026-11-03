import React from 'react';
import { createPortal } from 'react-dom';
import { RotateCw } from 'lucide-react';
import { t } from '@lingui/macro';
import type { Locale as DateFnsLocale } from 'date-fns';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { formatDateRange } from '@/features/planner/lib/dateUtils';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Badge } from '@/shared/ui/badge';
import type { Project, Status, Task } from '@/features/planner/types/planner';

interface TaskBarTooltipProps {
  task: Task;
  project: Project | undefined;
  status: Status | undefined;
  isRepeating: boolean;
  dateLocale: DateFnsLocale | undefined;
  position: { x: number; y: number };
  /** The card itself: a touch inside it must not close it on a phone. */
  containerRef: React.RefObject<HTMLDivElement>;
}

/**
 * The info card of a task bar: dates, people, project, status and type.
 * Mounted only while it shows, so the people and types it names are read here
 * rather than by every bar on the timeline.
 */
export const TaskBarTooltip: React.FC<TaskBarTooltipProps> = ({
  task,
  project,
  status,
  isRepeating,
  dateLocale,
  position,
  containerRef,
}) => {
  const taskTypes = usePlannerStore((state) => state.taskTypes);
  const assignees = usePlannerStore((state) => state.assignees);
  const taskType = taskTypes.find(t => t.id === task.typeId);
  const assignedAssignees = assignees.filter((assignee) => task.assigneeIds.includes(assignee.id));
  const assigneeLabel = assignedAssignees.length === 0
    ? t`Unassigned`
    : assignedAssignees.map((assignee) => assignee.name).join(', ');

  return createPortal(
    <div
      ref={containerRef}
      className="fixed z-[var(--layer-modal)] w-64 max-w-xs rounded-lg border bg-background p-3 shadow-xl"
      style={{ left: position.x, top: position.y }}
    >
      <div className="space-y-2">
        <div className="text-sm font-semibold text-foreground leading-snug break-words">
          {task.title}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDateRange(task.startDate, task.endDate, dateLocale)}
        </div>
        {isRepeating && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <RotateCw className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{t`Repeat`}</span>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          {t`Assignees`}: <span className="text-foreground font-medium">{assigneeLabel}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {t`Project`}: <span className="text-foreground font-medium">
            {project ? formatProjectLabel(project.name, project.code) : t`No project`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {status && (
            <Badge className="text-[10px]" variant="outline">
              {formatStatusLabel(status.name, status.emoji)}
            </Badge>
          )}
          {taskType && (
            <Badge className="text-[10px]" variant="secondary">
              {taskType.name}
            </Badge>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
