import React from 'react';
import { t } from '@lingui/macro';
import { PersonAvatar } from '@/features/planner/components/PersonAvatar';
import type { TeammateDraftView } from '@/features/planner/hooks/useTaskDraftPresence';
import { cn } from '@/shared/lib/classNames';

const draftLabel = (entry: TeammateDraftView) => {
  const name = entry.name;
  switch (entry.draft.kind) {
    case 'subtask-new':
      return t`${name} is writing a subtask`;
    case 'subtask-edit':
      return t`${name} is editing this subtask`;
    case 'comment':
      return t`${name} is writing a comment`;
    case 'description':
      return t`${name} is editing the description`;
  }
};

/**
 * A teammate's draft, live and semi-transparent: who is typing and, for
 * subtasks and comments, the text as it takes shape. Not interactive — it is a
 * preview of something that isn't saved yet.
 */
export const TeammateDraftLine: React.FC<{ entry: TeammateDraftView; className?: string }> = ({
  entry,
  className,
}) => {
  const text = 'text' in entry.draft ? entry.draft.text : null;
  return (
    <div
      className={cn('flex items-start gap-2 opacity-60', className)}
      data-testid="teammate-draft"
    >
      <PersonAvatar
        userId={entry.userId}
        name={entry.name}
        avatarUrl={entry.avatarUrl}
        colorSeed={entry.userId}
        size="sm"
        className="mt-0.5 h-5 w-5 shrink-0 text-[9px]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{draftLabel(entry)}</span>
          <span className="flex shrink-0 gap-0.5" aria-hidden="true">
            <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
          </span>
        </div>
        {text && (
          <div className="whitespace-pre-wrap break-words text-sm italic leading-snug text-foreground [overflow-wrap:anywhere]">
            {text}
          </div>
        )}
      </div>
    </div>
  );
};
