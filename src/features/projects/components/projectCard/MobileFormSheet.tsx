import React from 'react';
import { t } from '@lingui/macro';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';

interface MobileFormSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  title: string;
  description?: string;
  /**
   * Form body — usually a stack of inputs/textareas. The component renders a
   * `<form>` around it with submit/cancel actions in a sticky footer that
   * respects `safe-area-inset-bottom`.
   */
  children: React.ReactNode;
  saveLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  /** When false, the Save button is disabled. */
  canSave?: boolean;
  /** Optional left-aligned action (e.g. Delete) shown alongside Cancel/Save. */
  leftAction?: React.ReactNode;
}

/**
 * Bottom-sheet shell for multi-field mobile forms — TeamBlock add/edit,
 * CustomerBlock add contact, MilestonesBlock add. Wraps the body in a
 * `<form>` so Enter submits naturally; the sheet closes via the underlying
 * `Sheet` for Esc / scrim / hardware back.
 *
 * The shell does not own form state — callers manage their own values and
 * pass `onSubmit` + `canSave` so they can validate before firing the network
 * call. Sheet stays open on failure (`silent-success` guard from P1) — the
 * caller closes it explicitly when its async work resolves OK.
 */
export const MobileFormSheet: React.FC<MobileFormSheetProps> = ({
  open,
  onClose,
  onSubmit,
  title,
  description,
  children,
  saveLabel,
  cancelLabel,
  submitting = false,
  canSave = true,
  leftAction,
}) => (
  <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <SheetContent side="bottom" className="rounded-t-2xl">
      <SheetHeader className="text-left">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription className={description ? undefined : 'sr-only'}>
          {description ?? title}
        </SheetDescription>
      </SheetHeader>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSave || submitting) return;
          onSubmit();
        }}
      >
        <div className="flex flex-col gap-2.5">
          {children}
        </div>
        <div
          className="mt-1 flex flex-wrap items-center justify-end gap-2 pb-[env(safe-area-inset-bottom)]"
        >
          {leftAction && (
            <div className="mr-auto">
              {leftAction}
            </div>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            {cancelLabel ?? t`Cancel`}
          </Button>
          <Button type="submit" disabled={!canSave || submitting}>
            {saveLabel ?? t`Save`}
          </Button>
        </div>
      </form>
    </SheetContent>
  </Sheet>
);
