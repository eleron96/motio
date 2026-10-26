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
  const { status, kind, tasks } = column;
  // Cancelled work is rarely looked at: its column starts folded.
  const [collapsed, setCollapsed] = useState(kind === 'cancelled');

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
        'flex max-h-full w-72 flex-shrink-0 flex-col rounded-xl border border-transparent bg-muted/50 transition-colors',
        isDropTarget && 'border-primary bg-primary/5',
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground"
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

      {!collapsed && (
        <>
          <div className="flex min-h-[3rem] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
            {tasks.length === 0 && (
              <p className="px-1 py-3 text-center text-xs text-muted-foreground">{t`No tasks`}</p>
            )}
            {children}
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => onCreate(status.id)}
              className="m-2 mt-0 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              {t`Add task`}
            </button>
          )}
        </>
      )}
    </section>
  );
};
