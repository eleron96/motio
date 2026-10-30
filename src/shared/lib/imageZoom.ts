/**
 * Zoom and pan math for the image lightbox — no DOM, no React.
 *
 * The picture is laid out "fitted" (its base size, `base`) in the middle of the
 * stage (`viewport`) and then moved with `translate(x, y) scale(scale)` around
 * its centre. Points are measured from the stage centre, so the fitted picture
 * at rest is `{ scale: 1, x: 0, y: 0 }`.
 */

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
/** One press of +/− multiplies or divides the scale by this much. */
export const ZOOM_STEP = 1.5;
/** Double click / double tap on a fitted picture jumps to this scale. */
export const DOUBLE_TAP_ZOOM = 2.5;

export const RESTING_ZOOM: ZoomState = { scale: 1, x: 0, y: 0 };

export const clampScale = (scale: number): number => {
  if (!Number.isFinite(scale)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
};

const clampAxis = (offset: number, scaledLength: number, viewportLength: number): number => {
  // A picture narrower than the stage stays centred on that axis; a wider one
  // may move only until its edge reaches the stage edge — never off into blank.
  const slack = Math.max(0, (scaledLength - viewportLength) / 2);
  const clamped = Math.min(slack, Math.max(-slack, offset));
  // No -0: a centred picture is plain 0, not a sign-flipped twin of it.
  return clamped === 0 ? 0 : clamped;
};

/** Keeps the picture covering as much of the stage as it can at this scale. */
export const clampOffset = (state: ZoomState, viewport: Size, base: Size): ZoomState => {
  const scale = clampScale(state.scale);
  return {
    scale,
    x: clampAxis(state.x, base.width * scale, viewport.width),
    y: clampAxis(state.y, base.height * scale, viewport.height),
  };
};

/**
 * Changes the scale while the point under `focus` (stage-centre coordinates)
 * stays under it — the way a wheel or a pinch is expected to zoom.
 */
export const zoomAt = (
  state: ZoomState,
  nextScale: number,
  focus: Point,
  viewport: Size,
  base: Size,
): ZoomState => {
  const scale = clampScale(nextScale);
  const ratio = scale / state.scale;
  return clampOffset({
    scale,
    x: focus.x - (focus.x - state.x) * ratio,
    y: focus.y - (focus.y - state.y) * ratio,
  }, viewport, base);
};

/** Scale factor for one wheel event; lines and pages count as pixels. */
export const wheelZoomFactor = (deltaY: number, deltaMode = 0): number => {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  // Clamped so one fast flick of a free-spinning wheel isn't a jump to 8×.
  const bounded = Math.max(-100, Math.min(100, pixels));
  return Math.exp(-bounded * 0.004);
};

export interface PinchStart {
  state: ZoomState;
  distance: number;
  midpoint: Point;
}

/**
 * Two-finger gesture: the scale follows the finger distance and the picture
 * point that was under the fingers' midpoint follows that midpoint — so a pinch
 * zooms and pans at once, like a photo viewer.
 */
export const pinchZoom = (
  start: PinchStart,
  distance: number,
  midpoint: Point,
  viewport: Size,
  base: Size,
): ZoomState => {
  if (start.distance <= 0) return start.state;
  const scale = clampScale(start.state.scale * (distance / start.distance));
  const ratio = scale / start.state.scale;
  return clampOffset({
    scale,
    x: midpoint.x - (start.midpoint.x - start.state.x) * ratio,
    y: midpoint.y - (start.midpoint.y - start.state.y) * ratio,
  }, viewport, base);
};

export const isZoomed = (state: ZoomState): boolean => state.scale > MIN_ZOOM + 0.001;
