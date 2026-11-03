import React, { Suspense } from 'react';
import { t } from '@lingui/macro';
import { lazyNamed } from '@/shared/lib/lazyComponent';
import { Button } from '@/shared/ui/button';
import { ComposerEyebrow } from '@/features/planner/components/ComposerEyebrow';
import { TeammateDraftLine } from '@/features/planner/components/TeammateDraftLine';
import type { useTaskDraftPresence } from '@/features/planner/hooks/useTaskDraftPresence';

const LazyRichTextEditor = lazyNamed(
  () => import('@/features/planner/components/RichTextEditor'),
  'RichTextEditor'
);

type DraftPresence = ReturnType<typeof useTaskDraftPresence>;

interface TaskDetailDescriptionProps {
  /** Teammates writing the description right now. */
  descriptionDrafts: DraftPresence['teammateDrafts'];
  shareDraft: DraftPresence['shareDraft'];
  descriptionConflict: boolean;
  descriptionConflictRef: React.RefObject<HTMLDivElement>;
  onTakeTeammateVersion: () => void;
  onKeepMine: () => void;
  /** The text is still being fetched. */
  descriptionLoading: boolean;
  draftDescription: string;
  workspaceId: string | null;
  isReadOnly: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/** The description of the open task: the editor, who else is writing it, and the conflict banner. */
export const TaskDetailDescription: React.FC<TaskDetailDescriptionProps> = ({
  descriptionDrafts,
  shareDraft,
  descriptionConflict,
  descriptionConflictRef,
  onTakeTeammateVersion,
  onKeepMine,
  descriptionLoading,
  draftDescription,
  workspaceId,
  isReadOnly,
  onChange,
  onBlur,
}) => (
  <div className="space-y-2">
    <ComposerEyebrow>{t`Description`}</ComposerEyebrow>
    {descriptionDrafts.map((entry) => (
      <TeammateDraftLine key={entry.userId} entry={entry} />
    ))}
    {descriptionConflict && (
      <div
        ref={descriptionConflictRef}
        role="alert"
        className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <p>{t`Someone changed the description while you were writing. Your text is kept here.`}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onTakeTeammateVersion}
          >
            {t`Show their version`}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onKeepMine}
          >
            {t`Keep mine`}
          </Button>
        </div>
      </div>
    )}
    {descriptionLoading ? (
      <div className="min-h-[140px] rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground animate-pulse" />
    ) : (
      <Suspense fallback={
        <div className="min-h-[140px] rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {t`Loading editor...`}
        </div>
      }>
        <div
          // Only that someone edits the description is shared, not its text.
          onFocus={() => { if (!isReadOnly) shareDraft('description', { kind: 'description' }); }}
          onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            shareDraft('description', null);
          }}
        >
          <LazyRichTextEditor
            id="description"
            framed
            value={draftDescription}
            workspaceId={workspaceId}
            onChange={(value) => onChange(value || '')}
            onBlur={onBlur}
            placeholder={t`Add a description...`}
            disabled={isReadOnly}
          />
        </div>
      </Suspense>
    )}
  </div>
);
