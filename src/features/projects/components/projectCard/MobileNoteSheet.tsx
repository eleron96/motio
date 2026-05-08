import React, { useEffect, useState } from 'react';
import { t } from '@lingui/macro';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { RichTextEditor } from '@/features/planner/components/RichTextEditor';

interface MobileNoteSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Resolves to `true` on success and `false` on failure. The sheet stays
   * open with the user's draft on failure (silent-success guard).
   */
  onSave: (value: string) => Promise<boolean>;
  title: string;
  description?: string;
  /** Initial value populated when the sheet opens. */
  initialValue?: string;
  placeholder?: string;
  saveLabel?: string;
  cancelLabel?: string;
  /** Workspace id passed to the rich-text editor for image uploads. */
  workspaceId?: string | null;
}

/**
 * Bottom-sheet wrapper around the project rich-text editor. Used by mobile
 * note flows (compose new note, edit existing) so users get bold / italic /
 * lists / quote / image upload on touch the same way they do on desktop.
 *
 * The toolbar is intentionally not "redesigned for touch" — its 28×28 px
 * buttons are below Apple's 44pt recommendation, but bringing the desktop
 * RTE in is what users explicitly asked for. A future polish pass can
 * upsize the toolbar; that's tracked separately.
 */
export const MobileNoteSheet: React.FC<MobileNoteSheetProps> = ({
  open,
  onClose,
  onSave,
  title,
  description,
  initialValue = '',
  placeholder,
  saveLabel,
  cancelLabel,
  workspaceId,
}) => {
  const [value, setValue] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setSubmitting(false);
    }
  }, [open, initialValue]);

  // Empty / whitespace-only / image-less drafts cannot be published. We mirror
  // the meaningfulness check used by the desktop composer: any text content or
  // any <img> inside the HTML is enough.
  const meaningful = (() => {
    if (!value) return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/<img\b/i.test(trimmed)) return true;
    const text = trimmed.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
    return text.length > 0;
  })();

  const submit = async () => {
    if (!meaningful || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSave(value);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className={description ? undefined : 'sr-only'}>
            {description ?? title}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3 flex flex-col gap-3">
          <RichTextEditor
            value={value}
            onChange={setValue}
            workspaceId={workspaceId ?? null}
            placeholder={placeholder}
            disabled={submitting}
          />
          <div className="flex flex-wrap justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {cancelLabel ?? t`Cancel`}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={!meaningful || submitting}>
              {saveLabel ?? t`Save`}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
