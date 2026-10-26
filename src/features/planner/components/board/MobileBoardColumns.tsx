import React, { useCallback, useEffect, useRef, useState } from 'react';
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

  // Edge shades on the tab strip say "there is more this way" — without them
  // the last tab simply ran under the "+" button.
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const left = strip.scrollLeft > 2;
    const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
    setEdges((current) => (current.left === left && current.right === right ? current : { left, right }));
  }, []);
  useEffect(() => {
    updateEdges();
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [updateEdges, columns.length]);

  if (!activeColumn) return null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center border-b border-border bg-card">
        <div className="relative min-w-0 flex-1">
          {/* A horizontal scroller: the deck leaves gestures that start here alone. */}
          <div
            ref={stripRef}
            role="tablist"
            aria-label={t`Statuses`}
            onScroll={updateEdges}
            className="flex gap-1 overflow-x-auto px-2 py-2 scrollbar-hidden"
          >
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
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent transition-opacity',
              edges.left ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent transition-opacity',
              edges.right ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>
        {canCreate && (
          // Set apart from the strip by a divider and a soft shadow, so it does
          // not read as one more tab half-hidden at the end of the row.
          <div className="flex flex-shrink-0 items-center border-l border-border py-2 pl-2 pr-2 shadow-[-6px_0_10px_-8px_rgba(15,23,42,0.35)]">
            <button
              type="button"
              onClick={() => onCreate(activeColumn.status.id)}
              aria-label={t`Add task`}
              className="press flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
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

      {/* Page dots: how many columns there are and which one is on screen.
          Between the two floating buttons, at their height. */}
      {columns.length > 1 && (
        <div
          aria-hidden
          data-testid="board-page-dots"
          className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+2rem+24px)] z-20 flex justify-center"
        >
          <div className="flex items-center gap-1.5 rounded-full bg-card/90 px-2.5 py-1.5 shadow-sm">
            {columns.map((column, index) => (
              <span
                key={column.status.id}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  index === activeIndex ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/40',
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
