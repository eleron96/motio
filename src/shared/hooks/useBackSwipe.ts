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
 * Returns a `ref` for the screen's root element plus props to spread on it.
 * The ref is not decoration: once the drag is ours the browser has to be told
 * to keep out, and that veto must be a non-passive `touchmove` listener —
 * React attaches its own touch handlers passively, where `preventDefault` does
 * nothing. Without it the browser can decide mid-drag that this was a scroll,
 * fire `pointercancel`, and the screen stops following the finger halfway.
 */
export const useBackSwipe = (onBack: (() => void) | undefined) => {
  const gestureRef = React.useRef<{
    pointerId: number;
    x0: number;
    y0: number;
    dx: number;
    active: boolean;
  } | null>(null);
  // A swipe still ends in a click on whatever was under the finger, so without
  // this, going back would also open the row you swiped across.
  const swallowClickRef = React.useRef(false);
  const nodeRef = React.useRef<HTMLElement | null>(null);

  const keepGesture = React.useCallback((event: TouchEvent) => {
    if (!gestureRef.current?.active) return;
    if (event.cancelable) event.preventDefault();
  }, []);

  // A callback ref rather than an effect: the screen's node comes and goes with
  // the dialog, long after this hook first runs.
  const ref = React.useCallback((node: HTMLElement | null) => {
    if (nodeRef.current) {
      nodeRef.current.removeEventListener('touchmove', keepGesture);
    }
    nodeRef.current = node;
    if (node) {
      node.addEventListener('touchmove', keepGesture, { passive: false });
    }
  }, [keepGesture]);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!onBack) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    let node = event.target instanceof HTMLElement ? event.target : null;
    while (node && node !== event.currentTarget) {
      if (node.dataset.swipeIgnore !== undefined) return;
      node = node.parentElement;
    }
    // Cleared when the next gesture starts rather than by the click that, on
    // touch, may never come.
    swallowClickRef.current = false;
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
      swallowClickRef.current = true;
      // Keeps the events coming even once the finger leaves the element.
      // Not implemented in jsdom, and absent on some older mobile engines.
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
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

  const onClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    if (!swallowClickRef.current) return;
    swallowClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return { ref, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture };
};
