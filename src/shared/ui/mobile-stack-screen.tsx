import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, X } from 'lucide-react';
import { t } from '@lingui/macro';
import { cn } from '@/shared/lib/classNames';
import { MobilePillSubnav, type MobilePillSubnavItem } from '@/shared/ui/mobile-pill-subnav';
import { MobileSwipeDeck } from '@/shared/ui/mobile-swipe-deck';

export interface MobileStackSection {
  id: string;
  label: string;
  tone?: 'danger';
  content: React.ReactNode;
  /**
   * Off for content that brings its own padding and scroller (a panel reused
   * from elsewhere) — the page then just hands it the full height.
   */
  padded?: boolean;
}

interface MobileStackScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Screen-reader description of the screen (not shown). */
  description?: string;
  /** Rendered as the back arrow, and used by the swipe-right-on-first-page gesture. */
  onBack?: () => void;
  sections: MobileStackSection[];
  activeId: string;
  onActiveChange: (id: string) => void;
  className?: string;
}

/**
 * A full-screen phone screen pushed on top of the app: sticky header with back
 * and close, a scrollable strip of section tabs, and section pages you can swipe
 * between (swiping right on the first one goes back). Built on the same Radix
 * dialog primitives as the app's other modals, so focus trapping, Esc and the
 * scroll lock behave identically — it just fills the viewport instead of
 * floating as a card.
 */
export const MobileStackScreen: React.FC<MobileStackScreenProps> = ({
  open,
  onOpenChange,
  title,
  description,
  onBack,
  sections,
  activeId,
  onActiveChange,
  className,
}) => {
  const activeIndex = Math.max(0, sections.findIndex((section) => section.id === activeId));
  const single = sections.length <= 1;
  const items: MobilePillSubnavItem[] = sections.map((section) => ({
    id: section.id,
    label: section.label,
    tone: section.tone,
  }));

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          // A screen whose title says it all opts out of the description rather
          // than repeating the title to a screen reader (this also silences the
          // Radix "missing Description" warning).
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            // Opaque on purpose: the screen covers the app, it doesn't tint it.
            'fixed inset-0 z-50 flex flex-col bg-muted outline-none',
            'duration-300 data-[state=closed]:animate-out data-[state=open]:animate-in',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            className,
          )}
        >
          {/* min-h, not h: where the top inset is non-zero (installed PWA) a
              fixed height would let the notch eat the row instead of moving it
              down. */}
          <header className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border bg-card px-1.5 pt-[env(safe-area-inset-top,0px)]">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label={t`Back`}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <span className="h-11 w-11 shrink-0" aria-hidden="true" />
            )}
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-center text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="sr-only">
                {description}
              </DialogPrimitive.Description>
            )}
            <DialogPrimitive.Close
              aria-label={t`Close`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-[19px] w-[19px]" />
            </DialogPrimitive.Close>
          </header>

          {!single && (
            // The strip scrolls horizontally itself, so it must swallow the
            // gesture rather than let the deck page under the finger.
            <div data-swipe-ignore className="shrink-0 border-b border-border bg-card">
              <MobilePillSubnav
                items={items}
                activeId={activeId}
                onChange={onActiveChange}
                ariaLabel={typeof title === 'string' ? title : undefined}
              />
            </div>
          )}

          <MobileSwipeDeck
            index={activeIndex}
            count={sections.length}
            onIndexChange={(next) => onActiveChange(sections[next].id)}
            onEdgeBack={onBack}
          >
            {sections.map((section, index) => (
              <div
                key={section.id}
                className={cn(
                  'h-full min-h-0',
                  section.padded !== false
                    && 'overflow-y-auto overscroll-contain px-3.5 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+2.5rem)]',
                )}
              >
                {/* Only the page you are on and the ones you could swipe to are
                    mounted: settings sections carry pickers and long lists, and
                    mounting all six at once is a visible cost on a phone. */}
                {Math.abs(index - activeIndex) <= 1 ? section.content : null}
              </div>
            ))}
          </MobileSwipeDeck>

          {!single && (
            // Lifted clear of the iPhone home indicator: Safari reports
            // safe-area-inset-bottom as 0 without viewport-fit=cover, so the
            // clearance has to be a real gap, not just the inset.
            <div className="flex shrink-0 items-center justify-center gap-1.5 pt-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+1.75rem)]">
              {sections.map((section, index) => (
                <span
                  key={section.id}
                  aria-hidden="true"
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-200',
                    index === activeIndex
                      ? cn('w-4', section.tone === 'danger' ? 'bg-destructive' : 'bg-foreground')
                      : 'w-1.5 bg-border',
                  )}
                />
              ))}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
