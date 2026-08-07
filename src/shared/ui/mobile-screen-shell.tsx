import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft } from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { useKeyboardOffset } from '@/shared/hooks/useKeyboardOffset';
import { useBackSwipe } from '@/shared/hooks/useBackSwipe';

interface MobileScreenShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Row pinned under the header — a search box, a filter strip. */
  toolbar?: React.ReactNode;
  /** Control pinned to the right of the title — usually an actions menu. */
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Extra classes for the scrolling body. */
  contentClassName?: string;
}

/**
 * The chrome shared by every screen that opens *on top of* a mobile form: a
 * header with a back arrow, a body that scrolls, and geometry that survives the
 * on-screen keyboard.
 *
 * Bottom-anchored on purpose. A top-anchored layer only compensates for the
 * keyboard's height, not for iOS shifting the whole visual viewport, so its
 * header — and the way out — drifts off the top of the screen. Anchoring to the
 * bottom of the visual viewport puts the top edge exactly at
 * `visualViewport.offsetTop`, where it stays.
 */
export const MobileScreenShell: React.FC<MobileScreenShellProps> = ({
  open,
  onOpenChange,
  title,
  toolbar,
  action,
  children,
  contentClassName,
}) => {
  const { offset: keyboardOffset, height: viewportHeight } = useKeyboardOffset();
  const { ref: backSwipeRef, ...backSwipe } = useBackSwipe(() => onOpenChange(false));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={backSwipeRef}
          onOpenAutoFocus={(event) => event.preventDefault()}
          aria-describedby={undefined}
          className={cn(
            // z-[60]: this always opens over a MobileFormScreen (z-50).
            'fixed inset-x-0 z-[60] flex flex-col bg-muted outline-none',
            'duration-300 data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          )}
          style={{
            bottom: keyboardOffset,
            height: viewportHeight ? `${viewportHeight}px` : '100svh',
            transition: 'bottom 150ms ease-out',
            // Vertical scrolling stays the browser's; sideways is the back
            // gesture's, and the page's own horizontal rubber-banding must not
            // compete for it.
            touchAction: 'pan-y',
            overscrollBehaviorX: 'none',
          }}
          // A portal escapes the DOM but not the React tree: without this,
          // every pointer event here still bubbles into whatever rendered the
          // screen — for the settings screens that is the section swipe deck,
          // which read a back swipe as its own and paged to the section next
          // door instead of letting this screen close.
          data-swipe-ignore
          onPointerDown={(event) => {
            event.stopPropagation();
            backSwipe.onPointerDown(event);
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
            backSwipe.onPointerMove(event);
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            backSwipe.onPointerUp(event);
          }}
          onPointerCancel={(event) => {
            event.stopPropagation();
            backSwipe.onPointerCancel();
          }}
          onClickCapture={backSwipe.onClickCapture}
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
            <DialogPrimitive.Title
              className={cn(
                'min-w-0 flex-1 truncate text-center text-base font-semibold',
                // Balances the back arrow so the title stays optically centred.
                action ? undefined : 'pr-11',
              )}
            >
              {title}
            </DialogPrimitive.Title>
            {action && <div className="shrink-0">{action}</div>}
          </header>

          {toolbar && (
            <div className="shrink-0 border-b border-border bg-card px-3.5 py-2.5">{toolbar}</div>
          )}

          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain',
              // The extra 1.5rem is clearance, not decoration: Safari reports
              // safe-area-inset-bottom as 0 without viewport-fit=cover, and the
              // last row would sit in the screen's rounded corner.
              'px-3.5 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]',
              contentClassName,
            )}
          >
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
