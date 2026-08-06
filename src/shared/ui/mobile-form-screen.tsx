import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft } from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { useKeyboardOffset } from '@/shared/hooks/useKeyboardOffset';

interface MobileFormScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Screen-reader description; omitted means the title says it all. */
  description?: string;
  /** Extra controls under the title (a mode switch, a filter row). */
  toolbar?: React.ReactNode;
  /** Pinned action bar at the bottom (submit / cancel). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

/**
 * A form that fills the phone screen instead of floating as a centred card.
 *
 * Why not a dialog: a centred card is positioned against the LAYOUT viewport,
 * which iOS does not shrink when the keyboard opens — the card gets scrolled
 * out of the top of the screen and cannot be brought back (its title, and the
 * way out, disappear). A top-anchored screen sized to the VISUAL viewport
 * stays put: the header with the back arrow is always reachable and only the
 * body scrolls.
 */
export const MobileFormScreen: React.FC<MobileFormScreenProps> = ({
  open,
  onOpenChange,
  title,
  description,
  toolbar,
  footer,
  children,
  className,
  contentClassName,
}) => {
  const { offset: keyboardOffset, height: viewportHeight } = useKeyboardOffset();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed inset-x-0 z-50 flex flex-col bg-background outline-none',
            'duration-300 data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            className,
          )}
          style={{
            // Anchored to the BOTTOM of the visual viewport, not the top: that
            // way the top edge lands at visualViewport.offsetTop, so the header
            // survives iOS shifting the visual viewport — top-0 would only
            // compensate for the keyboard's height, and the back arrow would
            // still scroll out of reach. Same recipe as the projectCard sheets.
            bottom: keyboardOffset,
            height: viewportHeight ? `${viewportHeight}px` : '100svh',
            // Only `bottom` transitions: iOS delivers the height change as a jump.
            transition: 'bottom 150ms ease-out',
          }}
        >
          <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-1.5 pt-[env(safe-area-inset-top,0px)]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t`Back`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate pr-11 text-center text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="sr-only">
                {description}
              </DialogPrimitive.Description>
            )}
          </header>

          {toolbar && (
            <div className="shrink-0 border-b border-border bg-card px-3.5 py-2.5">{toolbar}</div>
          )}

          <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', contentClassName)}>
            {children}
          </div>

          {footer && (
            // The extra 1.5rem is real clearance, not decoration: Safari reports
            // safe-area-inset-bottom as 0 without viewport-fit=cover, so without
            // it the buttons sit in the screen's rounded corners and get clipped.
            <div className="shrink-0 border-t border-border bg-card px-3.5 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] pt-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
