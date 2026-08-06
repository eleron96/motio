import React from 'react';

/** Movement before a touch counts as a swipe rather than a tap. */
const SWIPE_START_PX = 16;
/** Rightward travel that commits the back gesture. */
const SWIPE_COMMIT_PX = 80;

/**
 * "Swipe right to go back" for full-screen phone screens, in the shape the
 * platform trains people to expect.
 *
 * The gesture only claims a touch that is clearly horizontal and rightward, so
 * vertical scrolling inside the screen is untouched; a horizontally scrollable
 * strip can opt out with `data-swipe-ignore`.
 *
 * Returns props to spread on the screen's root element.
 */
export const useBackSwipe = (onBack: (() => void) | undefined) => {
  const gestureRef = React.useRef<{
    pointerId: number;
    x0: number;
    y0: number;
    dx: number;
    active: boolean;
  } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!onBack) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    let node = event.target instanceof HTMLElement ? event.target : null;
    while (node && node !== event.currentTarget) {
      if (node.dataset.swipeIgnore !== undefined) return;
      node = node.parentElement;
    }
    gestureRef.current = {
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      dx: 0,
      active: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const dx = event.clientX - gesture.x0;
    const dy = event.clientY - gesture.y0;

    if (!gesture.active) {
      if (Math.abs(dx) < SWIPE_START_PX && Math.abs(dy) < SWIPE_START_PX) return;
      // Anything vertical, or a leftward drag, belongs to the content.
      if (dx <= 0 || Math.abs(dx) <= Math.abs(dy)) {
        gestureRef.current = null;
        return;
      }
      gesture.active = true;
    }

    gesture.dx = dx;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (gesture && gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (!gesture?.active) return;
    if (gesture.dx >= SWIPE_COMMIT_PX) onBack?.();
  };

  const onPointerCancel = () => {
    gestureRef.current = null;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
};
