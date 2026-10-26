import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Flag, MessageSquare, Repeat } from 'lucide-react';
import { t } from '@lingui/macro';
import type { Assignee, Project, Task } from '@/features/planner/types/planner';
import type { BoardColumnKind } from '@/shared/domain/boardColumns';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { TaskBarMenu } from '@/features/planner/components/timeline/TaskBarMenu';
import { TaskBarDeleteDialog } from '@/features/planner/components/timeline/TaskBarDeleteDialog';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/shared/ui/context-menu';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { DEFAULT_NEUTRAL_COLOR, TASK_PRIORITY_COLORS } from '@/shared/lib/colors';
import { cn } from '@/shared/lib/classNames';

const MAX_AVATARS = 3;

export interface BoardCardProps {
  task: Task;
  kind: BoardColumnKind;
  overdue: boolean;
  project: Project | undefined;
  people: Assignee[];
  commentCount: number;
  dueLabel: string;
  canEdit: boolean;
  highlighted: boolean;
  dragging: boolean;
  onOpen: (taskId: string) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
}

const BoardCardBase: React.FC<BoardCardProps> = ({
  task,
  kind,
  overdue,
  project,
  people,
  commentCount,
  dueLabel,
  canEdit,
  highlighted,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  // The delete dialog is mounted on first use only, like on the timeline bar.
  const [deleteMounted, setDeleteMounted] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (highlighted) cardRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [highlighted]);

  const handleRequestDelete = useCallback(() => {
    setDeleteMounted(true);
    setDeleteOpen(true);
  }, []);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    onDragStart(task.id);
  };

  const shownPeople = people.slice(0, MAX_AVATARS);
  const hiddenPeopleCount = people.length - shownPeople.length;
  const projectColor = project?.color ?? DEFAULT_NEUTRAL_COLOR;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={cardRef}
          role="button"
          tabIndex={0}
          data-task-id={task.id}
          draggable={canEdit}
          onDragStart={canEdit ? handleDragStart : undefined}
          onDragEnd={canEdit ? onDragEnd : undefined}
          onClick={() => onOpen(task.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen(task.id);
            }
          }}
          className={cn(
            'group relative cursor-pointer select-none rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-shadow',
            'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            canEdit && 'active:cursor-grabbing',
            kind !== 'open' && 'opacity-75',
            dragging && 'opacity-40',
            highlighted && 'ring-2 ring-primary',
          )}
          style={{ borderLeft: `4px solid ${projectColor}` }}
        >
          {project && (
            <div className="mb-1 truncate text-xs text-muted-foreground">
              {formatProjectLabel(project.name, project.code)}
            </div>
          )}
          <div
            className={cn(
              'line-clamp-3 break-words text-sm font-medium leading-snug text-foreground',
              kind === 'cancelled' && 'line-through',
            )}
          >
            {task.title}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-destructive')}
                title={overdue ? t`Overdue` : t`Due date`}
              >
                <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                {dueLabel}
              </span>
              {task.repeatId && (
                <Repeat className="h-3.5 w-3.5 flex-shrink-0" aria-label={t`Repeating task`} />
              )}
              {task.priority && (
                <Flag
                  className="h-3.5 w-3.5 flex-shrink-0"
                  style={{ color: TASK_PRIORITY_COLORS[task.priority] }}
                  aria-label={t`Priority`}
                />
              )}
              {commentCount > 0 && (
                <span className="inline-flex items-center gap-0.5" aria-label={t`Comments`}>
                  <MessageSquare className="h-3.5 w-3.5 flex-shrink-0" />
                  {commentCount}
                </span>
              )}
            </div>
            {shownPeople.length > 0 && (
              <div className="flex flex-shrink-0 -space-x-1.5">
                {shownPeople.map((person) => (
                  <PersonAvatar
                    key={person.id}
                    assigneeId={person.id}
                    name={person.name}
                    avatarUrl={person.avatar}
                    size="xs"
                    className="ring-2 ring-card"
                  />
                ))}
                {hiddenPeopleCount > 0 && (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1 text-[10px] text-muted-foreground ring-2 ring-card">
                    +{hiddenPeopleCount}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {/* Mounted only while the menu is open — same lazy body as the timeline bar. */}
        <TaskBarMenu task={task} canEdit={canEdit} onRequestDelete={handleRequestDelete} />
      </ContextMenuContent>
      {deleteMounted && (
        <TaskBarDeleteDialog
          task={task}
          canEdit={canEdit}
          rowAssigneeId={null}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </ContextMenu>
  );
};

export const BoardCard = React.memo(BoardCardBase);
BoardCard.displayName = 'BoardCard';
