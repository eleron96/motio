import React, { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { t } from '@lingui/macro';
import type { BoardColumn } from '@/shared/domain/boardColumns';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';
import { formatStatusLabel } from '@/shared/lib/statusLabels';
import { cn } from '@/shared/lib/classNames';

interface MobileBoardColumnsProps {
  columns: BoardColumn[];
  canCreate: boolean;
  onCreate: (statusId: string) => void;
  /** Cards of one column; the parent owns the card props. */
  renderCards: (column: BoardColumn) => React.ReactNode;
}

/**
 * The board on a phone: a strip of status tabs with counts on top and one
 * column per screen below, swiped left and right. Dragging between columns is
 * unreliable under a finger, so a status changes through the card's menu.
 */
export const MobileBoardColumns: React.FC<MobileBoardColumnsProps> = ({
  columns,
  canCreate,
  onCreate,
  renderCards,
}) => {
  // Keyed by status, so a column added or filtered away does not shift the
  // person onto another column.
  const [activeStatusId, setActiveStatusId] = useState<string | null>(columns[0]?.status.id ?? null);
  const foundIndex = columns.findIndex((column) => column.status.id === activeStatusId);
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;
  const activeColumn = columns[activeIndex];

  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!activeColumn) return;
    tabRefs.current.get(activeColumn.status.id)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [activeColumn]);

  if (!activeColumn) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-card">
        {/* A horizontal scroller: the deck leaves gestures that start here alone. */}
        <div role="tablist" aria-label={t`Statuses`} className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2 py-2 scrollbar-hidden">
          {columns.map((column, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={column.status.id}
                ref={(node) => {
                  if (node) tabRefs.current.set(column.status.id, node);
                  else tabRefs.current.delete(column.status.id);
                }}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveStatusId(column.status.id)}
                className={cn(
                  'press inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                  active ? 'border-primary/40 bg-primary/15 text-primary' : 'border-border text-foreground',
                )}
              >
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: column.status.color }} />
                <span className="max-w-[9rem] truncate">{formatStatusLabel(column.status.name, column.status.emoji)}</span>
                <span className={cn('text-xs', active ? 'text-primary/80' : 'text-muted-foreground')}>{column.tasks.length}</span>
              </button>
            );
          })}
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => onCreate(activeColumn.status.id)}
            aria-label={t`Add task`}
            className="press mr-2 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border text-foreground"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>

      <MobileSwipeDeck
        index={activeIndex}
        count={columns.length}
        onIndexChange={(next) => setActiveStatusId(columns[next]?.status.id ?? null)}
      >
        {columns.map((column) => (
          <div
            key={column.status.id}
            role="tabpanel"
            aria-label={column.status.name}
            data-status-id={column.status.id}
            // Room under the last card for the floating filter / add buttons.
            className="flex h-full flex-col gap-2 overflow-y-auto overscroll-contain bg-muted/60 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)]"
          >
            {column.tasks.length === 0 && (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">{t`No tasks`}</p>
            )}
            {renderCards(column)}
          </div>
        ))}
      </MobileSwipeDeck>
    </div>
  );
};
