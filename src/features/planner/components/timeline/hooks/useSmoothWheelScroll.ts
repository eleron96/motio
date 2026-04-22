import { RefObject, useEffect } from 'react';

/**
 * Smooths mouse-wheel scrolling inside a scrollable element. Mouse wheels fire
 * large, chunky delta events (≥40px per tick), which the browser applies
 * instantly — the result is visibly step-jerky on a long timeline. Trackpads
 * already stream many small deltas (<40px) so their native scrolling feels
 * fluid; we skip smoothing there to avoid adding perceived latency.
 *
 * For wheel events we recognise as coming from a mouse, we:
 *   1. preventDefault and manage scroll ourselves;
 *   2. keep a `target` scroll position that accumulates wheel deltas;
 *   3. ease the real scrollLeft/Top toward that target inside rAF so the motion
 *      plays out over ~150-200ms instead of jumping in one paint.
 */
export function useSmoothWheelScroll(ref: RefObject<HTMLElement>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let targetLeft = el.scrollLeft;
    let targetTop = el.scrollTop;
    let animationFrame: number | null = null;
    let animating = false;

    const tick = () => {
      const currentLeft = el.scrollLeft;
      const currentTop = el.scrollTop;
      const dx = targetLeft - currentLeft;
      const dy = targetTop - currentTop;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.5) {
        el.scrollLeft = targetLeft;
        el.scrollTop = targetTop;
        animationFrame = null;
        animating = false;
        return;
      }
      // Ease-out — step ~22% of remaining distance per frame.
      el.scrollLeft = currentLeft + dx * 0.22;
      el.scrollTop = currentTop + dy * 0.22;
      animationFrame = window.requestAnimationFrame(tick);
    };

    const onWheel = (event: WheelEvent) => {
      // Let browsers handle ctrl/cmd-wheel (page zoom gestures).
      if (event.ctrlKey || event.metaKey) return;

      const ay = Math.abs(event.deltaY);
      const ax = Math.abs(event.deltaX);
      const isLineOrPage = event.deltaMode !== 0;
      // Heuristic: mouse wheels ship big integer pixel steps (≥40px) or use
      // line/page delta modes. Trackpads emit small (<40px) pixel deltas with
      // frequent sub-pixel increments.
      const looksLikeMouse = isLineOrPage
        || (ay >= 40 && Number.isInteger(event.deltaY) && ax === 0)
        || (ax >= 40 && Number.isInteger(event.deltaX) && ay === 0);

      if (!looksLikeMouse) {
        // Trackpad — let the native scroll happen. If we were mid-animation,
        // abort so our target doesn't fight the user's new input.
        if (animating) {
          targetLeft = el.scrollLeft;
          targetTop = el.scrollTop;
        }
        return;
      }

      event.preventDefault();

      if (!animating) {
        // Re-anchor to the real position in case something else scrolled us.
        targetLeft = el.scrollLeft;
        targetTop = el.scrollTop;
      }

      // Convert line/page deltas to pixels (rough but close enough).
      const unit = event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? el.clientHeight
          : 1;

      targetLeft += event.deltaX * unit;
      targetTop += event.deltaY * unit;

      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      if (targetLeft < 0) targetLeft = 0;
      else if (targetLeft > maxLeft) targetLeft = maxLeft;
      if (targetTop < 0) targetTop = 0;
      else if (targetTop > maxTop) targetTop = maxTop;

      animating = true;
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    // passive: false so preventDefault works.
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheel);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [ref]);
}
