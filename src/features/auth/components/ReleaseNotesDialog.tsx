import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { APP_VERSION } from '@/shared/lib/appVersion';
// Type-only: the module inlines both CHANGELOG files, so it is loaded on demand
// when the dialog opens (see the effect below), never with this component.
import type { ReleaseNotesEntry } from '@/shared/lib/releaseNotes';
import { ReleaseNotesList } from './ReleaseNotesList';
import { useLocaleStore } from '@/shared/store/localeStore';

interface ReleaseNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Latest changes" — opened by tapping the app version, both in the desktop
 * account-settings footer and in the phone menu sheet.
 */
export const ReleaseNotesDialog: React.FC<ReleaseNotesDialogProps> = ({ open, onOpenChange }) => {
  const locale = useLocaleStore((state) => state.locale);
  const isRussianLocale = locale === 'ru';

  // Fetched only once the dialog is open: the module carries the full changelog.
  // `null` means "not loaded yet" and renders a loading line; `[]` means loaded
  // and genuinely empty.
  const [releaseNotes, setReleaseNotes] = useState<ReleaseNotesEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void import('@/shared/lib/releaseNotes')
      .then(({ getRecentReleaseNotes }) => {
        if (cancelled) return;
        setReleaseNotes(getRecentReleaseNotes(locale));
      })
      .catch(() => {
        // A failed chunk load is handled globally (preloadErrorReload); locally
        // just fall back to the empty state instead of a stuck spinner.
        if (!cancelled) setReleaseNotes([]);
      });

    return () => {
      cancelled = true;
    };
  }, [open, locale]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* rounded-2xl for phones — the stock styles only round from `sm:` up. */}
      <DialogContent className="w-[95vw] max-w-xl rounded-2xl">
        <DialogHeader>
          <DialogTitle>{isRussianLocale ? 'Последние изменения' : 'Latest changes'}</DialogTitle>
          <DialogDescription>
            {isRussianLocale ? `Версия ${APP_VERSION}` : `Version ${APP_VERSION}`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-6 overflow-y-auto pr-1 text-left">
          <ReleaseNotesList entries={releaseNotes} isRussianLocale={isRussianLocale} />
        </div>
      </DialogContent>
    </Dialog>
  );
};
