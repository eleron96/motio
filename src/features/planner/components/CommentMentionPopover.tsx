import React from 'react';
import { createPortal } from 'react-dom';
import { DismissableLayerBranch } from '@radix-ui/react-dismissable-layer';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { PersonAvatar } from '@/shared/components/PersonAvatar';
import type { getCommentMentionPopoverPosition } from '@/features/planner/lib/commentMentionPopoverPosition';
import type { TaskCommentMentionCandidate } from '@/shared/domain/taskCommentMentionCandidates';

interface CommentMentionPopoverProps {
  open: boolean;
  position: ReturnType<typeof getCommentMentionPopoverPosition> | null;
  listRef: React.RefObject<HTMLDivElement>;
  loading: boolean;
  candidates: TaskCommentMentionCandidate[];
  highlight: number;
  onPick: (candidate: TaskCommentMentionCandidate) => void;
  onHover: (index: number) => void;
}

/** The people list of the @-mention picker, portalled above every surface. */
export const CommentMentionPopover: React.FC<CommentMentionPopoverProps> = ({
  open,
  position,
  listRef,
  loading,
  candidates,
  highlight,
  onPick,
  onHover,
}) => {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <DismissableLayerBranch
      data-mention-branch="true"
      className="pointer-events-auto"
    >
      <div
        data-mention-popover="true"
        // Portalled to the body, so its layer is global: keep it a step above
        // whatever surface the editor sits on. See src/shared/ui/layers.ts.
        className="fixed z-[calc(var(--layer-modal)_+_10)] flex w-64 flex-col overflow-hidden rounded-md border bg-popover shadow-md pointer-events-auto"
        style={
          position
            ? {
                top: position.top,
                left: position.left,
                // Never taller than the room actually left on screen, so a
                // cramped viewport crops the list instead of hiding it.
                maxHeight: position.maxHeight,
                pointerEvents: 'auto',
              }
            : {
                visibility: 'hidden',
                pointerEvents: 'auto',
              }
        }
        ref={listRef}
        data-placement={position?.placement}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b px-3 py-1.5">
          <span className="text-xs text-muted-foreground">
            {loading
              ? t`Loading members...`
              : candidates.length === 0
              ? t`No members found`
              : t`Select a member`}
          </span>
        </div>
        <div
          data-mention-options="true"
          className="min-h-0 max-h-48 flex-1 overflow-y-auto overscroll-contain py-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {candidates.map((candidate, idx) => (
            <button
              key={candidate.id}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                idx === highlight
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent hover:text-accent-foreground',
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPick(candidate);
              }}
              onMouseEnter={() => onHover(idx)}
            >
              {/* Photo when the person has one, monogram otherwise */}
              <PersonAvatar
                userId={candidate.userId}
                name={candidate.name}
                avatarUrl={candidate.avatarUrl}
                colorSeed={candidate.userId}
                size="xs"
                className="shrink-0"
              />
              <span className="truncate">{candidate.name}</span>
            </button>
          ))}
        </div>
      </div>
    </DismissableLayerBranch>,
    document.body,
  );
};
