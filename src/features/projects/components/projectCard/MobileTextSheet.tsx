import React, { useEffect, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useKeyboardOffset } from '@/shared/hooks/useKeyboardOffset';

interface MobileTextSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Resolves to `true` on success and `false` on failure. The sheet stays
   * open with the user's draft on failure so they can retry — same contract
   * we adopted across all card forms in P1.
   */
  onSave: (value: string) => Promise<boolean>;
  title: string;
  /** Helper line under the title; surfaced only to screen readers if empty. */
  description?: string;
  /** Initial value populated when the sheet opens. */
  initialValue?: string;
  placeholder?: string;
  saveLabel?: string;
  cancelLabel?: string;
  /** When true, render a multiline `<Textarea>` instead of single-line `<Input>`. */
  multiline?: boolean;
  /** Optional minimum length validation; below this Save is disabled. */
  minLength?: number;
  /** Allow saving an empty value (e.g. clearing project status). Defaults to false. */
  allowEmpty?: boolean;
}

/**
 * Bottom-sheet wrapper used by mobile edit flows that take a single piece of
 * free-form text — project status (M2) and the activity composer (M2). Edit
 * variants of the activity feed reuse this with `multiline` for parity.
 *
 * Behavior:
 * - Auto-focuses the input/textarea when the sheet opens.
 * - Esc / scrim tap / back gesture close via the underlying `Sheet`.
 * - Save button is gated on length + a `submitting` flag so double-taps are
 *   ignored. The sheet only closes when the parent's handler returns `true`.
 */
export const MobileTextSheet: React.FC<MobileTextSheetProps> = ({
  open,
  onClose,
  onSave,
  title,
  description,
  initialValue = '',
  placeholder,
  saveLabel,
  cancelLabel,
  multiline = false,
  minLength = 0,
  allowEmpty = false,
}) => {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const { offset: keyboardOffset, height: viewportHeight } = useKeyboardOffset();

  // Reset draft + focus whenever the sheet opens.
  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setSubmitting(false);
      // Defer focus to next paint so the sheet animation doesn't steal it.
      const id = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
        if (inputRef.current && 'select' in inputRef.current) {
          inputRef.current.select();
        }
      });
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [open, initialValue]);

  const trimmed = value.trim();
  const meetsMin = trimmed.length >= minLength;
  const canSave = !submitting && (allowEmpty || (trimmed.length > 0 && meetsMin));

  const submit = async () => {
    if (!canSave) return;
    setSubmitting(true);
    try {
      const ok = await onSave(trimmed);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
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
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className={description ? undefined : 'sr-only'}>
            {description ?? title}
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {multiline ? (
            <Textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              rows={6}
              disabled={submitting}
              autoFocus
            />
          ) : (
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              disabled={submitting}
              autoFocus
            />
          )}
          <div
            className="flex flex-wrap justify-end gap-2 pb-[env(safe-area-inset-bottom)]"
          >
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {cancelLabel ?? t`Cancel`}
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saveLabel ?? t`Save`}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
