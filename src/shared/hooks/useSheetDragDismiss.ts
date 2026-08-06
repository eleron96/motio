import React from 'react';

/** How far down the sheet must be dragged before releasing dismisses it. */
const DISMISS_DISTANCE = 90;
/**
 * Movement before a touch counts as a drag rather than a tap. Above iOS's ~10px
 * tap slop, so resting a thumb on a row still activates the row.
 */
const DRAG_START_PX = 16;
/** How the sheet glides back when the drag did not go far enough. */
const SETTLE = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)';

interface SheetDragDismiss {
  /** Spread onto the sheet content. */
  handlers: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  };
  /** Merge into the sheet's own style. */
  style: React.CSSProperties;
}

/**
 * Drag a bottom sheet down to dismiss it.
 *
 * Radix's Dialog has no such gesture — a sheet with its corner X hidden can only
 * be closed by tapping the dim area behind it, which is the one part of the
 * screen a thumb resting at the bottom never reaches. The sheet follows the
 * finger down, springs back if the pull was short, and closes past the
 * threshold.
 *
 * Only downward drags are taken, and only when the sheet's scroller is already
 * at the top: otherwise pulling down inside a scrolled list would fight it.
 */
export const useSheetDragDismiss = (onDismiss: () => void): SheetDragDismiss => {
  const [offset, setOffset] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const gestureRef = React.useRef<{
    pointerId: number;
    startY: number;
    startX: number;
    dragging: boolean;
  } | null>(null);
  // A finished drag produces no click on touch, so the flag has to be cleared
  // when the next gesture starts rather than by the click that never comes.
  const swallowClickRef = React.useRef(false);

  const reset = React.useCallback(() => {
    gestureRef.current = null;
    setDragging(false);
    setOffset(0);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swallowClickRef.current = false;
    // Pulling down inside a list that is scrolled belongs to the list.
    const scroller = (event.currentTarget as HTMLElement);
    if (scroller.scrollTop > 0) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startX: event.clientX,
      dragging: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dy = event.clientY - gesture.startY;
    const dx = event.clientX - gesture.startX;

    if (!gesture.dragging) {
      // Lock the axis once, so a diagonal thumb does not start a dismiss while
      // the user meant to scroll or to swipe sideways.
      if (Math.abs(dy) < DRAG_START_PX && Math.abs(dx) < DRAG_START_PX) return;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        gestureRef.current = null;
        return;
      }
      gesture.dragging = true;
      setDragging(true);
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Safari throws when the pointer is already gone; the drag still works.
        }
      }
    }

    setOffset(Math.max(0, dy));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (gesture && gesture.pointerId !== event.pointerId) return;
    if (!gesture?.dragging) {
      reset();
      return;
    }

    const dy = event.clientY - gesture.startY;
    swallowClickRef.current = true;
    reset();
    if (dy > DISMISS_DISTANCE) onDismiss();
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (gesture && gesture.pointerId !== event.pointerId) return;
    // A cancel is the system taking the gesture away, not a release: never
    // dismiss on it.
    reset();
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    if (!swallowClickRef.current) return;
    swallowClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onClickCapture: handleClickCapture,
    },
    style: {
      transform: offset > 0 ? `translateY(${offset}px)` : undefined,
      transition: dragging ? 'none' : SETTLE,
      touchAction: dragging ? 'none' : undefined,
    },
  };
};
