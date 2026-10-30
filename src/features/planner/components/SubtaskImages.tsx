import React from 'react';
import { t } from '@lingui/macro';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';
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

/** Thumbnails under a subtask: a tap opens the lightbox, × takes one off. */
export const SubtaskImageStrip: React.FC<SubtaskImageStripProps> = ({
  images,
  uploadingCount,
  resolveSrc,
  canRemove,
  onOpen,
  onRemove,
}) => {
  if (images.length === 0 && uploadingCount === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="subtask-images">
      {images.map((image, index) => {
        const src = resolveSrc(image);
        const label = t`Image ${index + 1}`;
        return (
          <div key={image.id} className="group/thumb relative">
            <button
              type="button"
              className="block h-14 w-14 overflow-hidden rounded-md border border-border bg-muted cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpen({ src, alt: label })}
              aria-label={t`Open image`}
            >
              <img src={src} alt={label} loading="lazy" draggable={false} className="h-full w-full object-cover" />
            </button>
            {canRemove && (
              <button
                type="button"
                className={cn(
                  'absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-opacity hover:text-foreground',
                  // Hover reveals it with a mouse; a touch screen has no hover,
                  // so there it is always shown.
                  'opacity-0 focus-visible:opacity-100 group-hover/thumb:opacity-100 [@media(hover:none)]:opacity-100',
                )}
                onClick={() => onRemove(image.id)}
                aria-label={t`Remove image`}
                title={t`Remove image`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
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
    </div>
  );
};
