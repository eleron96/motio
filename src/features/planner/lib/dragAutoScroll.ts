/**
 * Edge auto-scroll for dragging a task bar along the timeline (desktop).
 *
 * The bar follows the mouse, but the timeline only renders a few months and the
 * viewport is narrower still. Once the cursor reaches a strip at either side of
 * the date area the container keeps scrolling on its own, so a task can travel
 * weeks past the visible screen in one drag. Pure math lives here; the rAF
 * loop that applies it lives in TaskBar.
 */

/** Width (px) of the strip at each side of the date area that triggers scrolling. */
export const DRAG_EDGE_ZONE_PX = 56;
/** Slowest scroll (px per frame) at the inner border of the strip. */
export const DRAG_EDGE_MIN_SPEED = 3;
/** Fastest scroll (px per frame) at the outer border of the strip and beyond. */
export const DRAG_EDGE_MAX_SPEED = 24;

export interface ViewportBounds {
  /** Client-x of the left edge of the scrollable date area (right of the sidebar). */
  left: number;
  /** Client-x of the right edge of the visible date area. */
  right: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Horizontal scroll to apply this frame for a cursor at `clientX`: negative
 * scrolls left, positive right, 0 outside both strips. The speed ramps up
 * quadratically toward the edge and stays at maximum past it, so dragging out
 * of the window keeps scrolling at full speed.
 */
export const getEdgeScrollVelocity = (
  clientX: number,
  bounds: ViewportBounds,
  zone: number = DRAG_EDGE_ZONE_PX,
  minSpeed: number = DRAG_EDGE_MIN_SPEED,
  maxSpeed: number = DRAG_EDGE_MAX_SPEED,
): number => {
  const width = bounds.right - bounds.left;
  if (!(width > 0)) return 0;
  // Never let the two strips overlap on a narrow viewport.
  const zoneWidth = Math.min(zone, width / 3);
  if (!(zoneWidth > 0)) return 0;

  const speed = (proximity: number) => minSpeed + (maxSpeed - minSpeed) * proximity * proximity;

  const leftInner = bounds.left + zoneWidth;
  if (clientX < leftInner) {
    return -speed(clamp01((leftInner - clientX) / zoneWidth));
  }
  const rightInner = bounds.right - zoneWidth;
  if (clientX > rightInner) {
    return speed(clamp01((clientX - rightInner) / zoneWidth));
  }
  return 0;
};

/**
 * Whole days a drag moved the bar: the mouse travel plus however far the
 * container scrolled underneath it since the press, snapped to the grid.
 */
export const computeDragDeltaDays = (
  pointerDeltaX: number,
  scrollDeltaX: number,
  dayWidth: number,
): number => {
  if (!(dayWidth > 0)) return 0;
  return Math.round((pointerDeltaX + scrollDeltaX) / dayWidth);
};
