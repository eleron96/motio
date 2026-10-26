import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { t } from '@lingui/macro';
import type { BoardColumn as BoardColumnModel } from '@/shared/domain/boardColumns';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { cn } from '@/shared/lib/classNames';

interface BoardColumnProps {
  column: BoardColumnModel;
  /** Drag in progress over this column — highlights it as the drop target. */
  isDropTarget: boolean;
  canCreate: boolean;
  onCreate: (statusId: string) => void;
  onDragOver: (statusId: string) => void;
  onDragLeave: (statusId: string) => void;
  onDrop: (statusId: string) => void;
  children: React.ReactNode;
}

export const BoardColumn: React.FC<BoardColumnProps> = ({
  column,
  isDropTarget,
  canCreate,
  onCreate,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}) => {
  const { status, tasks } = column;
  // Every column starts open, cancelled included: a folded column hid its
  // cards and people did not realise they were there. Folding is by click.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section
      aria-label={status.name}
      data-status-id={status.id}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        onDragOver(status.id);
      }}
      onDragLeave={(event) => {
        // Moving onto a card inside the column fires dragleave on the column;
        // only a pointer that really left it clears the target.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        onDragLeave(status.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(status.id);
      }}
      className={cn(
        // Columns share the width between 18 and 24rem: a few statuses fill a
        // wide screen, many of them scroll sideways instead of getting cramped.
        // A folded column stays narrow — there is nothing in it to widen for.
        'flex max-h-full flex-col rounded-xl border border-border bg-muted/80 shadow-sm transition-colors',
        collapsed ? 'w-60 flex-none' : 'min-w-[18rem] max-w-[24rem] flex-1 basis-0',
        isDropTarget && 'border-primary bg-primary/10',
      )}
    >
      <div className="flex items-center gap-1 border-b border-border/60 py-1.5 pl-1.5 pr-1.5">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm font-medium text-foreground hover:bg-background/60"
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
          <span
            aria-hidden
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <span className="min-w-0 flex-1 truncate">{formatStatusLabel(status.name, status.emoji)}</span>
          <span className="flex-shrink-0 rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
            {tasks.length}
          </span>
        </button>
        {canCreate && (
          <button
            type="button"
            onClick={() => onCreate(status.id)}
            aria-label={t`Add task`}
            title={t`Add task`}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="flex min-h-[3rem] flex-1 flex-col gap-2 overflow-y-auto p-2">
          {tasks.length === 0 && (
            <p className="px-1 py-3 text-center text-xs text-muted-foreground">{t`No tasks`}</p>
          )}
          {children}
        </div>
      )}
    </section>
  );
};
