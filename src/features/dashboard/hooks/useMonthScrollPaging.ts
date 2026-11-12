import { useCallback, useEffect, useRef } from 'react';

// A mouse wheel arrives in big events: ~100px a notch in Chrome (several quick
// notches may come merged into one event of 200–300px), 3 lines = 48px in
// Firefox. Anything this big is notches, a month per ~NOTCH_SIZE and at least
// one, so three notches are three months whatever the browser.
const NOTCH_MIN = 40;
const NOTCH_SIZE = 100;
// A trackpad (or a smooth-scrolling mouse) sends many small events: they add
// up, a month per this much finger travel.
const TRACKPAD_STEP = 80;
// A pause this long starts a fresh gesture, so a leftover from the last one
// never tips the next one over by a month.
const WHEEL_IDLE_MS = 200;
// Lines and pages (Firefox with some mice) in pixels.
const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 400;
// A finger has to travel this far sideways, and more sideways than down, to page.
const SWIPE_MIN = 50;

/**
 * Pages the month grid the way a calendar app does: scroll down or right to go
 * forward, up or left to go back — exactly a month per wheel notch, as many
 * as a trackpad flick carries. A sideways swipe on a touch screen pages a screen.
 *
 * `onStep(months)` gets a signed number of months; the caller clamps it to the
 * window. Returns a callback ref for the element that takes the gestures.
 */
export const useMonthScrollPaging = ({
  onStep,
  swipeMonths,
}: {
  onStep: (months: number) => void;
  /** How many months one swipe moves: a screenful. */
  swipeMonths: number;
}) => {
  const onStepRef = useRef(onStep);
  const swipeMonthsRef = useRef(swipeMonths);
  useEffect(() => {
    onStepRef.current = onStep;
    swipeMonthsRef.current = swipeMonths;
  }, [onStep, swipeMonths]);

  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((node: HTMLElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;

    let carried = 0;
    let lastWheelAt = 0;
    const onWheel = (event: WheelEvent) => {
      // Pinch-zoom on a trackpad and ctrl+wheel zoom the page; leave them be.
      if (event.ctrlKey) return;
      const unit = event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? PAGE_HEIGHT : 1;
      // Whichever axis the hand is moving along: a mouse wheel scrolls down,
      // a trackpad may well scroll sideways.
      const delta = (Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX) * unit;
      if (delta === 0) return;
      // The board fits the screen, so the page has nothing of its own to scroll here.
      event.preventDefault();
      if (event.timeStamp - lastWheelAt > WHEEL_IDLE_MS || Math.sign(delta) !== Math.sign(carried)) carried = 0;
      lastWheelAt = event.timeStamp;
      if (Math.abs(delta) >= NOTCH_MIN) {
        carried = 0;
        onStepRef.current(Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / NOTCH_SIZE)));
        return;
      }
      carried += delta;
      const steps = Math.trunc(carried / TRACKPAD_STEP);
      if (steps === 0) return;
      carried -= steps * TRACKPAD_STEP;
      onStepRef.current(steps);
    };

    let touchStart: { id: number; x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!touchStart || event.pointerId !== touchStart.id) return;
      const dx = event.clientX - touchStart.x;
      const dy = event.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;
      // A swipe to the left brings the later months in, like turning a page.
      onStepRef.current(dx < 0 ? swipeMonthsRef.current : -swipeMonthsRef.current);
    };
    const onPointerCancel = () => { touchStart = null; };

    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', onPointerCancel);
    cleanupRef.current = () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerCancel);
    };
  }, []);
};
