import React, { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react';
import type { ProjectActivity } from '@/features/planner/types/planner';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { RichTextEditor } from '@/features/planner/components/RichTextEditor';
import { isContentMeaningful, renderRichTextHtml } from '@/features/projects/lib/projectActivityHtml';
import { useKeyboardOffset } from '@/shared/hooks/useKeyboardOffset';
import styles from './projectCard.module.css';

interface ActivityModalProps {
  entry: ProjectActivity;
  canEdit: boolean;
  /** When true, render as a bottom sheet instead of a centered dialog. */
  isMobile?: boolean;
  formatDate: (iso: string) => string;
  workspaceId?: string | null;
  onClose: () => void;
  /** Resolves to `true` on success; the modal closes itself on success only. */
  onSave: (content: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  /** Toggles the pinned flag on the open entry; modal stays open. */
  onTogglePinned: () => Promise<void>;
}

export const ActivityModal: React.FC<ActivityModalProps> = ({
  entry,
  canEdit,
  isMobile = false,
  formatDate,
  workspaceId,
  onClose,
  onSave,
  onDelete,
  onTogglePinned,
}) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.content);
  const [busy, setBusy] = useState(false);
  // Mobile-only: explicit confirm step replaces the inline destructive button
  // so users don't accidentally tap "Delete" while reaching for "Edit".
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [togglingPin, setTogglingPin] = useState(false);
  const { offset: keyboardOffset, height: viewportHeight } = useKeyboardOffset();

  const handleTogglePin = async () => {
    if (togglingPin) return;
    setTogglingPin(true);
    try {
      await onTogglePinned();
    } finally {
      setTogglingPin(false);
    }
  };

  useEffect(() => {
    setText(entry.content);
    setEditing(false);
    setConfirmingDelete(false);
  }, [entry]);

  const handleSave = async () => {
    if (busy) return;
    if (!isContentMeaningful(text)) return;
    setBusy(true);
    try {
      // Parent closes the modal only on success; on failure we stay in edit
      // mode so the user keeps their draft and can retry.
      await onSave(text);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  const meta = (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <div className="font-medium">{entry.authorDisplayName}</div>
      <div className="tabular-nums text-muted-foreground">{formatDate(entry.createdAt)}</div>
    </div>
  );

  const body = editing ? (
    // Same RTE on mobile and desktop — formatting + image upload requested
    // by users post-M2. The toolbar is small on touch but functional.
    // Auto-focus so the user can paste / type the moment they tap Edit.
    <RichTextEditor
      value={text}
      onChange={setText}
      workspaceId={workspaceId ?? null}
      placeholder={t`Write a comment...`}
      disabled={busy}
      autoFocus
    />
  ) : (
    <div
      className={`${styles.feedRichText} break-words text-[14px] leading-[1.55]`}
      dangerouslySetInnerHTML={renderRichTextHtml(entry.content)}
    />
  );

  const actions = editing ? (
    <>
      <Button variant="outline" onClick={() => { setEditing(false); setText(entry.content); }} disabled={busy}>
        {t`Cancel`}
      </Button>
      <Button onClick={() => void handleSave()} disabled={busy || !isContentMeaningful(text)}>
        {t`Save`}
      </Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={onClose}>{t`Close`}</Button>
      {canEdit && (
        <Button onClick={() => setEditing(true)}>{t`Edit`}</Button>
      )}
    </>
  );

  if (isMobile) {
    // Mobile read mode: header carries the title + a kebab `⋯` menu for the
    // destructive action (Delete). The bottom row holds a single full-width
    // Edit button so the primary task — "look at the note, maybe edit it" —
    // is one tap away. Sheet's built-in X covers the close affordance.
    //
    // Mobile edit mode: same Save / Cancel pair as desktop, but full-width
    // and h-11 for comfortable touch targets.
    //
    // Tapping Delete from the menu replaces the bottom area with an inline
    // confirm prompt — no second sheet stacked on top, just a momentary
    // "Are you sure?" within the same surface.
    return (
      <Sheet open onOpenChange={(open) => (open ? null : onClose())}>
        <SheetContent
          side="bottom"
          className="overflow-y-auto rounded-t-2xl"
          style={{
            bottom: keyboardOffset,
            maxHeight: viewportHeight ? `${viewportHeight}px` : undefined,
            transition: 'bottom 150ms ease-out',
          }}
        >
          <SheetHeader className="text-left">
            <div className="flex items-start justify-between gap-2 pr-8">
              <SheetTitle>{t`Note`}</SheetTitle>
              {canEdit && !editing && !confirmingDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 -mt-1"
                      aria-label={t`More actions`}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        void handleTogglePin();
                      }}
                      disabled={togglingPin}
                    >
                      {entry.pinned ? (
                        <>
                          <PinOff className="mr-2 h-4 w-4" aria-hidden="true" />
                          {t`Unpin`}
                        </>
                      ) : (
                        <>
                          <Pin className="mr-2 h-4 w-4" aria-hidden="true" />
                          {t`Pin to top`}
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={(event) => {
                        event.preventDefault();
                        setConfirmingDelete(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t`Delete`}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <SheetDescription className="sr-only">
              {t`Read or edit a single project note.`}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3 flex flex-col gap-3">
            {meta}
            {body}
            {confirmingDelete ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="text-[13px] text-foreground">
                  {t`Delete this note? This cannot be undone.`}
                </div>
                <div className="mt-3 flex gap-2 pb-[env(safe-area-inset-bottom)]">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={busy}
                  >
                    {t`Cancel`}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="h-11 flex-1"
                    onClick={() => void handleDelete()}
                    disabled={busy}
                  >
                    {t`Delete`}
                  </Button>
                </div>
              </div>
            ) : editing ? (
              <div className="mt-1 flex gap-2 pb-[env(safe-area-inset-bottom)]">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1"
                  onClick={() => { setEditing(false); setText(entry.content); }}
                  disabled={busy}
                >
                  {t`Cancel`}
                </Button>
                <Button
                  type="button"
                  className="h-11 flex-1"
                  onClick={() => void handleSave()}
                  disabled={busy || !isContentMeaningful(text)}
                >
                  {t`Save`}
                </Button>
              </div>
            ) : canEdit ? (
              <Button
                type="button"
                className="mt-1 h-11 w-full pb-[env(safe-area-inset-bottom)]"
                onClick={() => setEditing(true)}
              >
                {t`Edit`}
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t`Note`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`Read or edit a single project note.`}
          </DialogDescription>
        </DialogHeader>
        {meta}
        {body}
        <DialogFooter className="gap-2">
          {actions}
        </DialogFooter>
        {/* Top-right kebab carries the secondary actions (Pin / Delete) so
            the action row stays clean and the destructive option needs a
            deliberate two-tap path. Rendered last in the DOM order so
            Radix's focus trap doesn't park initial focus on it when the
            user toggles read↔edit. The dialog's built-in close X sits at
            right-4 top-4; this kebab nests just to its left. */}
        {canEdit && !editing && (
          <div className="absolute right-12 top-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  aria-label={t`More actions`}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleTogglePin();
                  }}
                  disabled={togglingPin}
                >
                  {entry.pinned ? (
                    <>
                      <PinOff className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t`Unpin`}
                    </>
                  ) : (
                    <>
                      <Pin className="mr-2 h-4 w-4" aria-hidden="true" />
                      {t`Pin to top`}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleDelete();
                  }}
                  disabled={busy}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t`Delete`}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
