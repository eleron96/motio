import React from 'react';
import { t } from '@lingui/macro';
import { Megaphone, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { useAnnouncements } from '@/features/announcements/hooks/useAnnouncements';

/**
 * Whatever the admin has to say, shown once.
 *
 * An ordinary announcement is a strip above the work area: people came here to
 * work, and a dialog in front of that is a toll. A service notice ("maintenance
 * at 22:00") is the exception — it interrupts, once, and closing it counts as
 * read either way.
 *
 * Only one is shown at a time; a critical one outranks the rest, and the others
 * wait their turn rather than stacking the header into a feed.
 */
export const AnnouncementsHost: React.FC = () => {
  const { announcements, dismiss } = useAnnouncements();
  const current = announcements[0] ?? null;

  if (!current) return null;

  if (current.level === 'critical') {
    return (
      <AlertDialog open onOpenChange={() => void dismiss(current.id)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{current.title}</AlertDialogTitle>
            {current.body && (
              <AlertDialogDescription className="whitespace-pre-wrap">
                {current.body}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => void dismiss(current.id)}>
              {t`Got it`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <div className="shrink-0 border-b border-border bg-primary/10">
      <div className="flex items-start gap-3 px-4 py-2.5">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-snug">{current.title}</div>
          {current.body && (
            <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {current.body}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground"
          onClick={() => void dismiss(current.id)}
          aria-label={t`Dismiss announcement`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
