import React, { useCallback, useEffect, useRef } from 'react';

/** How long a finger has to rest on the element. */
export const LONG_PRESS_MS = 500;
/** A finger that travels further is scrolling, not pressing. */
const LONG_PRESS_SLOP_PX = 10;

/**
 * Touch-and-hold on a phone: `onLongPress` fires once the finger has rested
 * LONG_PRESS_MS without moving, and the tap that follows the hold is
 * swallowed (`shouldSuppressClick`), so the element's own click doesn't run
 * on top of the menu. Mouse pointers are ignored — desktop has its own menu.
 */
export const useLongPress = (onLongPress: () => void) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    startRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === 'mouse') return;
    firedRef.current = false;
    startRef.current = { x: event.clientX, y: event.clientY };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      firedRef.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }, [onLongPress]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const start = startRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_SLOP_PX) cancel();
  }, [cancel]);

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // The platform's own long-press menu (save image, copy) would cover ours.
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  };

  /** Call from onClick: true right after a hold, so the tap is swallowed. */
  const shouldSuppressClick = () => {
    if (!firedRef.current) return false;
    firedRef.current = false;
    return true;
  };

  return { handlers, shouldSuppressClick };
};
