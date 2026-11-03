import React from 'react';
import { t } from '@lingui/macro';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogDescription, DialogHeader, DialogScrollContent, DialogTitle } from '@/shared/ui/dialog';
import { MobileFormScreen } from '@/shared/ui/mobile-form-screen';

const shouldIgnoreOutsideInteraction = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('[data-radix-popper-content-wrapper]')
    || target.closest('[data-mention-popover="true"]')
    || target.closest('[data-mention-branch="true"]'),
  );
};

interface TaskDetailFrameProps {
  isMobile: boolean;
  open: boolean;
  onRequestClose: () => void;
  /** «Created 9 June · updated today», or nothing for a task without dates. */
  timestampsMeta: string | null;
  onCancel: () => void;
  onDone: () => void;
  doneDisabled: boolean;
  /**
   * A field has its own use for Escape right now (a subtask being edited or
   * typed): it cancels that text instead of closing the card.
   */
  escapeBelongsToField: boolean;
  /** The confirmation dialogs, kept outside the card itself. */
  alerts: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The task card's shell: a wide dialog on desktop, a full-screen form with
 * pinned actions on a phone (rather than a card the keyboard pushes away).
 */
export const TaskDetailFrame: React.FC<TaskDetailFrameProps> = ({
  isMobile,
  open,
  onRequestClose,
  timestampsMeta,
  onCancel,
  onDone,
  doneDisabled,
  escapeBelongsToField,
  alerts,
  children,
}) => {
  const cancelButton = (
    <Button variant="outline" onClick={onCancel} className={isMobile ? 'h-11 flex-1' : undefined}>
      {t`Cancel`}
    </Button>
  );

  const doneButton = (
    <Button
      onClick={onDone}
      disabled={doneDisabled}
      className={isMobile ? 'h-11 flex-1' : undefined}
    >
      {/* Distinct id: the bare "Done" msgid is a task status («Завершено»). */}
      {t({ id: 'taskDetail.footer.done', message: 'Done' })}
    </Button>
  );

  if (isMobile) {
    return (
      <>
        <MobileFormScreen
          open={open}
          onOpenChange={(next) => { if (!next) onRequestClose(); }}
          title={t`Task details`}
          description={t`View and edit task details.`}
          footer={(
            <div className="flex flex-col gap-2">
              {/* The created/updated line reads above the actions here — on a
                  phone there is no room for it beside them. */}
              {timestampsMeta && (
                <span className="truncate text-center text-xs text-muted-foreground">
                  {timestampsMeta}
                </span>
              )}
              <div className="flex items-center gap-2">
                {cancelButton}
                {doneButton}
              </div>
            </div>
          )}
        >
          {children}
        </MobileFormScreen>
        {alerts}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onRequestClose()}>
        <DialogScrollContent
          className="flex w-full max-w-[940px] flex-col gap-0 p-0"
          // Don't auto-focus (and select) the title input when the panel opens.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            // While a subtask is being edited or a draft is typed, Escape
            // belongs to that field — it cancels the text, not the whole task.
            // The field's own handler still sees the key and clears itself.
            if (escapeBelongsToField) {
              e.preventDefault();
            }
          }}
          onInteractOutside={(e) => {
            if (shouldIgnoreOutsideInteraction(e.target)) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            if (shouldIgnoreOutsideInteraction(e.target)) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t`Task details`}</DialogTitle>
            <DialogDescription>{t`View and edit task details.`}</DialogDescription>
          </DialogHeader>

          {children}

          {/* ── Footer */}
          <div className="relative flex items-center justify-between gap-3 px-6 py-3.5">
            <span className="min-w-0 truncate text-xs text-muted-foreground">{timestampsMeta}</span>
            <div className="flex shrink-0 gap-2">
              {cancelButton}
              {doneButton}
            </div>
          </div>
        </DialogScrollContent>
      </Dialog>
      {alerts}
    </>
  );
};
