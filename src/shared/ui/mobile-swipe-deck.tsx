import React from 'react';
import { cn } from '@/shared/lib/classNames';

/** Movement before the gesture commits to an axis. */
const AXIS_LOCK_PX = 8;
/** Past this much horizontal travel, releasing flips the page. */
const MIN_COMMIT_PX = 56;
const COMMIT_RATIO = 0.16;
/** How much of the drag survives when there is nowhere to go. */
const EDGE_RESISTANCE = 0.34;
const TRANSITION = 'transform 400ms cubic-bezier(.4,.8,.3,1.02)';

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = React.useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
};

/**
 * A gesture that starts inside a horizontally scrollable strip (the section
 * tabs) belongs to that strip, not to the deck — otherwise flicking the tab
 * strip would also flip the page under it.
 */
const startsInsideHorizontalScroller = (target: EventTarget | null, root: HTMLElement | null) => {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== root) {
    if (node.dataset.swipeIgnore !== undefined) return true;
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflowX = window.getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
};

interface MobileSwipeDeckProps {
  index: number;
  count: number;
  onIndexChange: (next: number) => void;
  /** Swiping right on the first page — used to walk back up the stack. */
  onEdgeBack?: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * Horizontally swipeable pages. Vertical scrolling inside a page keeps working:
 * the gesture locks to an axis after the first few pixels and only steals the
 * drag when it is clearly horizontal.
 */
export const MobileSwipeDeck: React.FC<MobileSwipeDeckProps> = ({
  index,
  count,
  onIndexChange,
  onEdgeBack,
  className,
  children,
}) => {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const gestureRef = React.useRef<{
    pointerId: number;
    x0: number;
    y0: number;
    width: number;
    axis: 'x' | 'y' | null;
  } | null>(null);
  const [dx, setDx] = React.useState(0);
  const [swiping, setSwiping] = React.useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const endGesture = React.useCallback((commit: boolean) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setSwiping(false);
    const travelled = dx;
    setDx(0);
    if (!commit || !gesture || gesture.axis !== 'x') return;

    const threshold = Math.max(MIN_COMMIT_PX, gesture.width * COMMIT_RATIO);
    if (travelled < -threshold && index < count - 1) {
      onIndexChange(index + 1);
    } else if (travelled > threshold) {
      if (index > 0) onIndexChange(index - 1);
      else onEdgeBack?.();
    }
  }, [count, dx, index, onEdgeBack, onIndexChange]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (startsInsideHorizontalScroller(event.target, trackRef.current)) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      width: trackRef.current?.offsetWidth ?? 0,
      axis: null,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.x0;
    const deltaY = event.clientY - gesture.y0;

    if (!gesture.axis) {
      if (Math.abs(deltaX) < AXIS_LOCK_PX && Math.abs(deltaY) < AXIS_LOCK_PX) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        // Vertical: hand the gesture back to the scroller for good.
        gestureRef.current = null;
        return;
      }
      gesture.axis = 'x';
      setSwiping(true);
      // Not implemented in jsdom, and absent on some older mobile engines.
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    let travelled = deltaX;
    const atLastPage = index === count - 1;
    const atFirstPage = index === 0;
    if (atLastPage && travelled < 0) travelled *= EDGE_RESISTANCE;
    if (atFirstPage && travelled > 0 && !onEdgeBack) travelled *= EDGE_RESISTANCE;
    setDx(travelled);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current && gestureRef.current.pointerId !== event.pointerId) return;
    endGesture(true);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current && gestureRef.current.pointerId !== event.pointerId) return;
    endGesture(false);
  };

  const pages = React.Children.toArray(children);
  const offsetPercent = -index * (100 / count);

  return (
    <div
      ref={trackRef}
      data-testid="mobile-swipe-deck"
      className={cn('relative min-h-0 flex-1 overflow-hidden', className)}
      style={{ touchAction: 'pan-y' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        className="flex h-full"
        style={{
          width: `${count * 100}%`,
          transform: `translate3d(calc(${offsetPercent}% + ${dx}px), 0, 0)`,
          transition: swiping || reducedMotion ? 'none' : TRANSITION,
        }}
      >
        {pages.map((page, pageIndex) => (
          <div
            key={pageIndex}
            className="h-full min-h-0"
            style={{ width: `${100 / count}%` }}
            aria-hidden={pageIndex === index ? undefined : true}
            // aria-hidden alone still leaves the off-screen page tabbable, so a
            // paired keyboard would walk into controls nobody can see. `inert`
            // is not a React 18 prop — set it on the node directly.
            ref={(node) => {
              if (!node) return;
              if (pageIndex === index) node.removeAttribute('inert');
              else node.setAttribute('inert', '');
            }}
          >
            {page}
          </div>
        ))}
      </div>
    </div>
  );
};
