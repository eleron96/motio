import React, { useState } from 'react';
import { t } from '@lingui/macro';
import { Expand, Loader2, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useLongPress } from '@/shared/hooks/useLongPress';
import type { TaskSubtaskImage } from '@/shared/domain/taskSubtaskImages';
import type { LightboxImage } from '@/shared/lib/lightboxImage';

interface SubtaskImageStripProps {
  images: TaskSubtaskImage[];
  uploadingCount: number;
  resolveSrc: (image: TaskSubtaskImage) => string;
  canRemove: boolean;
  onOpen: (image: LightboxImage) => void;
  onRemove: (mediaId: string) => void;
}

type ThumbAction = { image: TaskSubtaskImage; src: string; label: string };

/**
 * Thumbnails under a subtask: a tap opens the lightbox. Removing is never one
 * stray tap away: on a computer it sits behind the thumbnail's "⋯" menu, on a
 * phone behind a touch-and-hold that opens a bottom sheet.
 */
export const SubtaskImageStrip: React.FC<SubtaskImageStripProps> = ({
  images,
  uploadingCount,
  resolveSrc,
  canRemove,
  onOpen,
  onRemove,
}) => {
  const isMobile = useIsMobile();
  const [sheetTarget, setSheetTarget] = useState<ThumbAction | null>(null);

  if (images.length === 0 && uploadingCount === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="subtask-images">
      {images.map((image, index) => {
        const src = resolveSrc(image);
        const label = t`Image ${index + 1}`;
        return (
          <SubtaskImageThumb
            key={image.id}
            src={src}
            label={label}
            canRemove={canRemove}
            isMobile={isMobile}
            onOpen={() => onOpen({ src, alt: label })}
            onRemove={() => onRemove(image.id)}
            onHold={() => setSheetTarget({ image, src, label })}
          />
        );
      })}
      {Array.from({ length: uploadingCount }, (_, index) => (
        <div
          key={`uploading-${index}`}
          className="grid h-14 w-14 place-items-center rounded-md border border-dashed border-border bg-muted/50"
          role="status"
          aria-label={t`Uploading image...`}
        >
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ))}

      {isMobile && (
        <Sheet open={sheetTarget !== null} onOpenChange={(open) => { if (!open) setSheetTarget(null); }}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]">
            <SheetHeader className="text-left">
              <SheetTitle>{sheetTarget?.label ?? ''}</SheetTitle>
              <SheetDescription className="sr-only">{t`Image actions`}</SheetDescription>
            </SheetHeader>
            {sheetTarget && (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={sheetTarget.src}
                  alt=""
                  draggable={false}
                  className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
                />
                <div className="flex flex-1 flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="press h-11 justify-start gap-2"
                    onClick={() => {
                      const target = sheetTarget;
                      setSheetTarget(null);
                      onOpen({ src: target.src, alt: target.label });
                    }}
                  >
                    <Expand className="h-4 w-4" aria-hidden="true" />
                    {t`Open image`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="press h-11 justify-start gap-2 text-destructive hover:text-destructive"
                    onClick={() => {
                      const target = sheetTarget;
                      setSheetTarget(null);
                      onRemove(target.image.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {t`Remove image`}
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};

interface SubtaskImageThumbProps {
  src: string;
  label: string;
  canRemove: boolean;
  isMobile: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onHold: () => void;
}

const SubtaskImageThumb: React.FC<SubtaskImageThumbProps> = ({
  src,
  label,
  canRemove,
  isMobile,
  onOpen,
  onRemove,
  onHold,
}) => {
  const holdEnabled = isMobile && canRemove;
  const { handlers, shouldSuppressClick } = useLongPress(onHold);

  return (
    <div className="group/thumb relative">
      <button
        type="button"
        className={cn(
          'block h-14 w-14 overflow-hidden rounded-md border border-border bg-muted cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          // No "save image" callout or text selection under a holding finger.
          holdEnabled && 'select-none [-webkit-touch-callout:none]',
        )}
        {...(holdEnabled ? handlers : {})}
        onClick={() => {
          if (holdEnabled && shouldSuppressClick()) return;
          onOpen();
        }}
        aria-label={t`Open image`}
      >
        <img src={src} alt={label} loading="lazy" draggable={false} className="h-full w-full object-cover" />
      </button>
      {canRemove && !isMobile && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition-opacity hover:text-foreground',
                'opacity-0 focus-visible:opacity-100 group-hover/thumb:opacity-100 data-[state=open]:opacity-100',
              )}
              aria-label={t`Image actions`}
              title={t`Image actions`}
            >
              <MoreHorizontal className="h-3 w-3" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={onOpen}>
              <Expand className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              {t`Open image`}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onRemove}>
              <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              {t`Remove image`}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
