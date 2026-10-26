import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, MessageSquare, MoreHorizontal, Repeat } from 'lucide-react';
import { t } from '@lingui/macro';
import type { Assignee, Project, Task, TaskPriority } from '@/features/planner/types/planner';
import type { BoardColumnKind } from '@/shared/domain/boardColumns';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import { TaskBarMenu } from '@/features/planner/components/timeline/TaskBarMenu';
import { TaskBarDeleteDialog } from '@/features/planner/components/timeline/TaskBarDeleteDialog';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/shared/ui/context-menu';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';
import { getTaskBarAppearance } from '@/features/planner/lib/taskBarColors';
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
  /**
   * Phone: no drag (a status changes through the menu), the ⋯ is always shown
   * and a long press opens the same menu.
   */
  touch?: boolean;
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
  touch = false,
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

  // Radix opens a context menu at the pointer of a `contextmenu` event on its
  // trigger. Replaying one from the ⋯ button opens the very same lazy menu as
  // a right click, instead of keeping a second copy of its items in sync.
  const handleMenuButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left,
      clientY: rect.bottom,
    }));
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    onDragStart(task.id);
  };

  // Same "!" / "‼" badge as the timeline bar, from the same colour rules.
  const priorityVisual = useMemo(() => (
    task.priority
      ? getTaskBarAppearance({ priority: task.priority, status: null }).priorityVisual
      : null
  ), [task.priority]);
  const priorityLabels: Record<TaskPriority, string> = {
    low: t`Low priority`,
    medium: t`Medium priority`,
    high: t`High priority`,
  };
  const priorityLabel = task.priority ? priorityLabels[task.priority] : '';

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
          draggable={canEdit && !touch}
          onDragStart={canEdit && !touch ? handleDragStart : undefined}
          onDragEnd={canEdit && !touch ? onDragEnd : undefined}
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
          // No iOS callout on a long press: that gesture opens the task menu.
          style={{ borderLeft: `4px solid ${projectColor}`, WebkitTouchCallout: 'none' }}
        >
          <button
            type="button"
            aria-label={t`Task actions`}
            title={t`Task actions`}
            onClick={handleMenuButtonClick}
            // Keep the card's own handlers out of it: Enter must not open the
            // task, and a press-and-move must not start dragging the card.
            onKeyDown={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            className={cn(
              'absolute right-1.5 top-1.5 flex items-center justify-center rounded-md text-muted-foreground transition-opacity',
              touch
                ? 'press h-8 w-8'
                : 'h-6 w-6 opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {project && (
            <div className={cn('mb-1 truncate text-xs text-muted-foreground', touch ? 'pr-8' : 'pr-6')}>
              {formatProjectLabel(project.name, project.code)}
            </div>
          )}
          <div className={cn('flex items-start gap-1.5', !project && (touch ? 'pr-8' : 'pr-6'))}>
            {priorityVisual && (
              <span
                className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.06)]"
                style={priorityVisual.badgeStyle}
                title={priorityLabel}
                aria-label={priorityLabel}
              >
                <span className={cn('text-[11px] font-black leading-none priority-blink', priorityVisual.className)}>
                  {priorityVisual.symbol}
                </span>
              </span>
            )}
            <div
              className={cn(
                'min-w-0 line-clamp-3 break-words text-sm font-medium leading-snug text-foreground',
                kind === 'cancelled' && 'line-through',
              )}
            >
              {task.title}
            </div>
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
      <ContextMenuContent className={cn(touch && 'min-w-[232px] rounded-2xl p-1.5')}>
        {/* Mounted only while the menu is open — same lazy body (and the same
            touch-sized rows on a phone) as the timeline bar. */}
        <TaskBarMenu task={task} canEdit={canEdit} onRequestDelete={handleRequestDelete} isMobile={touch} />
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
