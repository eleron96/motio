import React, { MutableRefObject, useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { ImagePlus, Menu, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { TaskSubtask } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { AutoGrowTextarea } from '@/shared/ui/auto-grow-textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { cn } from '@/shared/lib/classNames';
import { ComposerEyebrow } from '@/features/planner/components/ComposerEyebrow';
import { TeammateDraftLine } from '@/features/planner/components/TeammateDraftLine';
import type { ShareTaskDraft, TeammateDraftView } from '@/features/planner/hooks/useTaskDraftPresence';
import { SubtaskImageStrip } from '@/features/planner/components/SubtaskImages';
import { pastedImageFiles } from '@/features/planner/lib/pastedImageFiles';
import {
  SUBTASK_DRAFT_IMAGES_KEY,
  SubtaskImagesController,
} from '@/features/planner/hooks/useSubtaskImages';
import { MAX_SUBTASK_IMAGES } from '@/shared/domain/taskSubtaskImages';
import { ImageLightbox } from '@/shared/ui/image-lightbox';
import type { LightboxImage } from '@/shared/lib/lightboxImage';
import { useSubtaskDragReorder } from '@/features/planner/hooks/useSubtaskDragReorder';

interface SubtasksSectionProps {
  isReadOnly: boolean;
  subtasksOpen: boolean;
  subtasksLoading: boolean;
  subtasksSaving: boolean;
  subtasksError: string;
  subtasks: TaskSubtask[];
  newSubtaskTitle: string;
  completedSubtasksCount: number;
  subtaskInputRef: MutableRefObject<HTMLTextAreaElement | null>;
  onOpen: () => void;
  onNewTitleChange: (value: string) => void;
  onAdd: () => void;
  /**
   * Saves a typed draft when the composer loses focus, without pulling focus
   * back into it — a word typed there is a subtask, not a draft to lose.
   */
  onCommitDraft: () => void;
  onEdit: (subtaskId: string, title: string) => Promise<boolean>;
  onToggle: (subtaskId: string, isDone: boolean) => void;
  onDelete: (subtaskId: string) => void;
  /** Moves a subtask to another place; without it rows have no drag handle. */
  onReorder?: (subtaskId: string, toIndex: number) => void;
  /**
   * Fires whenever an inline subtask edit has uncommitted changes, so the
   * parent (task panel) can warn before closing and losing them.
   */
  onEditingDirtyChange?: (dirty: boolean) => void;
  /**
   * Fires while an inline subtask edit is open at all, so the parent can keep
   * Escape from closing the panel instead of just cancelling that edit.
   */
  onEditingActiveChange?: (active: boolean) => void;
  /** Teammates' live subtask drafts (new ones and edits), shown semi-transparent. */
  teammateDrafts?: TeammateDraftView[];
  /** Shares what this person types here with teammates who have the task open. */
  onShareDraft?: ShareTaskDraft;
  /** Pictures on subtasks; without it the list is text-only. */
  images?: SubtaskImagesController;
}

const NO_TEAMMATE_DRAFTS: TeammateDraftView[] = [];

export const SubtasksSection: React.FC<SubtasksSectionProps> = ({
  isReadOnly,
  subtasksOpen,
  subtasksLoading,
  subtasksSaving,
  subtasksError,
  subtasks,
  newSubtaskTitle,
  completedSubtasksCount,
  subtaskInputRef,
  onOpen,
  onNewTitleChange,
  onAdd,
  onCommitDraft,
  onEdit,
  onToggle,
  onDelete,
  onReorder,
  onEditingDirtyChange,
  onEditingActiveChange,
  teammateDrafts = NO_TEAMMATE_DRAFTS,
  onShareDraft,
  images,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  // Which subtask the file picker was opened for; null = the new subtask.
  const imageTargetRef = useRef<string | null>(null);
  const canAttachImages = Boolean(images?.canAttach) && !isReadOnly;
  const draftImages = images?.draftImages ?? [];

  const pickImages = (subtaskId: string | null) => {
    imageTargetRef.current = subtaskId;
    imageInputRef.current?.click();
  };

  const handleImagePaste = (subtaskId: string | null) => (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!canAttachImages || !images) return;
    const files = pastedImageFiles(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    images.attach(subtaskId, files);
  };
  const [editingTitle, setEditingTitle] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const canReorder = Boolean(onReorder) && !isReadOnly;
  const reorder = useSubtaskDragReorder({
    ids: subtasks.map((subtask) => subtask.id),
    enabled: canReorder && subtasks.length > 1,
    onReorder: (subtaskId, toIndex) => onReorder?.(subtaskId, toIndex),
  });
  // Numbers are as wide as the longest one, so titles stay in one column.
  const numberWidth = `${String(subtasks.length).length + 0.5}ch`;

  // An inline edit is "dirty" while it's open and the text differs from the
  // saved subtask title. Reported upward so the task panel can warn before a
  // close discards it.
  const editingOriginalTitle = editingId
    ? subtasks.find((subtask) => subtask.id === editingId)?.title ?? ''
    : '';
  const isEditingDirty = editingId !== null
    && editingTitle.trim() !== editingOriginalTitle.trim();

  useEffect(() => {
    onEditingDirtyChange?.(isEditingDirty);
    return () => onEditingDirtyChange?.(false);
  }, [isEditingDirty, onEditingDirtyChange]);

  const isEditingActive = editingId !== null;

  useEffect(() => {
    onEditingActiveChange?.(isEditingActive);
    return () => onEditingActiveChange?.(false);
  }, [isEditingActive, onEditingActiveChange]);

  // A teammate deleted the subtask being edited: the row is gone, so close
  // the edit instead of leaving an invisible one that still holds Escape.
  const editingSubtaskExists = editingId === null || subtasks.some((subtask) => subtask.id === editingId);
  useEffect(() => {
    if (editingSubtaskExists) return;
    setEditingId(null);
    setEditingTitle('');
  }, [editingSubtaskExists]);

  // What this person types here, live for teammates: the new-subtask composer
  // and an open edit, each in its own slot.
  useEffect(() => {
    onShareDraft?.('subtask-new', newSubtaskTitle.trim() ? { kind: 'subtask-new', text: newSubtaskTitle } : null);
  }, [newSubtaskTitle, onShareDraft]);

  useEffect(() => {
    onShareDraft?.('subtask-edit', editingId && isEditingDirty
      ? { kind: 'subtask-edit', subtaskId: editingId, text: editingTitle }
      : null);
  }, [editingId, editingTitle, isEditingDirty, onShareDraft]);

  const newSubtaskDrafts = teammateDrafts.filter((entry) => entry.draft.kind === 'subtask-new');
  const editDraftsFor = (subtaskId: string) => teammateDrafts.filter((entry) => (
    entry.draft.kind === 'subtask-edit' && entry.draft.subtaskId === subtaskId
  ));

  const startEditing = (subtaskId: string, title: string) => {
    setEditingId(subtaskId);
    setEditingTitle(title);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const commitEditing = async (subtaskId: string) => {
    const saved = await onEdit(subtaskId, editingTitle);
    if (saved) cancelEditing();
  };

  if (!subtasksOpen) {
    return (
      <div className="space-y-2">
        {newSubtaskDrafts.map((entry) => (
          <TeammateDraftLine key={entry.userId} entry={entry} className="px-1.5" />
        ))}
        <Button
          type="button"
          variant="ghost"
          className="h-8 w-fit gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onOpen}
        >
          <Plus className="h-3.5 w-3.5" />
          {t`Add subtask`}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ComposerEyebrow>
        {t`Subtasks`}
        {subtasks.length > 0 && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold tabular-nums tracking-normal text-secondary-foreground/80">
            {completedSubtasksCount}/{subtasks.length}
          </span>
        )}
      </ComposerEyebrow>

      {subtasksError && (
        <div className="text-xs text-destructive">{subtasksError}</div>
      )}

      {subtasksLoading ? (
        <div className="text-xs text-muted-foreground">{t`Loading...`}</div>
      ) : subtasks.length === 0 ? (
        <div className="text-xs text-muted-foreground">{t`No subtasks yet.`}</div>
      ) : (
        <div className="space-y-0.5">
          {subtasks.map((subtask) => (
            <React.Fragment key={subtask.id}>
              <div
                ref={reorder.registerRow(subtask.id)}
                style={reorder.rowStyle(subtask.id)}
                data-testid="subtask-row"
                className={cn(
                  'group flex items-start gap-2.5 rounded-md px-1.5 py-1',
                  reorder.draggingId === null && 'hover:bg-muted/60',
                  reorder.draggingId === subtask.id && 'bg-card shadow-md ring-1 ring-border',
                )}
              >
                {canReorder && (
                  <button
                    type="button"
                    {...reorder.handleProps(subtask.id)}
                    className={cn(
                      '-my-1 -mr-1.5 flex h-6 w-5 shrink-0 touch-none items-center justify-center rounded-sm text-muted-foreground/50',
                      'hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      subtasks.length > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                      reorder.draggingId === subtask.id && 'cursor-grabbing text-foreground',
                    )}
                    aria-label={t`Reorder subtask`}
                    title={t`Drag to reorder`}
                  >
                    <Menu className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
                <Checkbox
                  checked={subtask.isDone}
                  onCheckedChange={(value) => {
                    if (value === 'indeterminate') return;
                    onToggle(subtask.id, value === true);
                  }}
                  disabled={isReadOnly || editingId === subtask.id}
                />
                <span
                  className={cn(
                    '-mr-1 shrink-0 text-right text-sm leading-snug tabular-nums text-muted-foreground',
                    subtask.isDone && 'text-muted-foreground/60',
                  )}
                  style={{ minWidth: numberWidth }}
                  aria-hidden="true"
                >
                  {reorder.displayIndex(subtask.id) + 1}.
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                {editingId === subtask.id ? (
                  <AutoGrowTextarea
                    autoFocus
                    onPaste={handleImagePaste(subtask.id)}
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter saves; Shift+Enter inserts a newline.
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void commitEditing(subtask.id);
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelEditing();
                      }
                    }}
                    onBlur={() => void commitEditing(subtask.id)}
                    disabled={isReadOnly}
                    rows={2}
                    className="min-h-[56px] w-full text-sm"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (isReadOnly) return;
                      startEditing(subtask.id, subtask.title);
                    }}
                    disabled={isReadOnly}
                    className={cn(
                      'w-full whitespace-pre-wrap break-words text-left text-sm leading-snug text-foreground [overflow-wrap:anywhere]',
                      !isReadOnly && 'cursor-text',
                      subtask.isDone && 'line-through text-muted-foreground',
                    )}
                  >
                    {subtask.title}
                  </button>
                )}
                {images && (
                  <SubtaskImageStrip
                    images={subtask.images}
                    uploadingCount={images.uploading[subtask.id] ?? 0}
                    resolveSrc={images.resolveSrc}
                    canRemove={canAttachImages}
                    onOpen={setLightboxImage}
                    onRemove={(mediaId) => images.remove(subtask.id, mediaId)}
                  />
                )}
                </div>
                {editingId !== subtask.id && !isReadOnly && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        aria-label={t`Subtask actions`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => startEditing(subtask.id, subtask.title)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                        {t`Edit`}
                      </DropdownMenuItem>
                      {canAttachImages && subtask.images.length < MAX_SUBTASK_IMAGES && (
                        <DropdownMenuItem onSelect={() => pickImages(subtask.id)}>
                          <ImagePlus className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                          {t`Add image`}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={(event) => {
                          event.preventDefault();
                          setPendingDeleteId(subtask.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                        {t`Delete`}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {editDraftsFor(subtask.id).map((entry) => (
                <TeammateDraftLine
                  key={entry.userId}
                  entry={entry}
                  className={cn('pb-1 pr-1.5', canReorder ? 'pl-[4.5rem]' : 'pl-14')}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      )}

      {newSubtaskDrafts.length > 0 && (
        <div className="space-y-1.5 px-1.5">
          {newSubtaskDrafts.map((entry) => (
            <TeammateDraftLine key={entry.userId} entry={entry} />
          ))}
        </div>
      )}

      {!isReadOnly && images && (
        <SubtaskImageStrip
          images={draftImages}
          uploadingCount={images.uploading[SUBTASK_DRAFT_IMAGES_KEY] ?? 0}
          resolveSrc={images.resolveSrc}
          canRemove={canAttachImages}
          onOpen={setLightboxImage}
          onRemove={(mediaId) => images.remove(null, mediaId)}
        />
      )}

      {!isReadOnly && (
        <div className="flex items-start gap-2 pt-0.5">
          <AutoGrowTextarea
            ref={subtaskInputRef}
            value={newSubtaskTitle}
            onChange={(event) => onNewTitleChange(event.target.value)}
            onPaste={handleImagePaste(null)}
            onKeyDown={(event) => {
              // Escape drops the draft (its pictures too); the task panel keeps
              // that key from closing the whole task while a draft is unsent.
              if (event.key === 'Escape' && (newSubtaskTitle !== '' || draftImages.length > 0)) {
                event.preventDefault();
                onNewTitleChange('');
                images?.discardDraftImages();
                return;
              }
              // Enter adds the subtask; Shift+Enter inserts a newline.
              if (event.key !== 'Enter' || event.shiftKey) return;
              event.preventDefault();
              onAdd();
            }}
            onBlur={(event) => {
              // The window itself lost focus (another app, another tab): the
              // field keeps it, so the draft stays a draft until the user is back.
              if (event.currentTarget === document.activeElement) return;
              // Trailing blank lines never reach the saved subtask, so drop them
              // here instead of leaving the field stretched over empty rows.
              const trimmed = newSubtaskTitle.trim();
              if (trimmed !== newSubtaskTitle) onNewTitleChange(trimmed);
              if (trimmed) onCommitDraft();
            }}
            rows={1}
            placeholder={t`Subtask title`}
            disabled={subtasksSaving}
            className="min-h-[36px] flex-1 text-sm"
          />
          {canAttachImages && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              // Keep focus (and the typed draft) in the composer.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pickImages(null)}
              disabled={subtasksSaving || draftImages.length >= MAX_SUBTASK_IMAGES}
              aria-label={t`Add image`}
              title={t`Add image`}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0 px-3 text-xs"
            // Keep focus in the composer: a blur would save the draft first and
            // the field wouldn't get focus back for the next subtask.
            onMouseDown={(event) => event.preventDefault()}
            onClick={onAdd}
            disabled={subtasksSaving || !newSubtaskTitle.trim()}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t`Add`}
          </Button>
        </div>
      )}

      {canAttachImages && (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          data-testid="subtask-image-input"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length > 0) images?.attach(imageTargetRef.current, files);
          }}
        />
      )}

      <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete subtask?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId) onDelete(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              {t`Delete`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
