import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  RESTING_ZOOM,
  clampOffset,
  clampScale,
  isZoomed,
  pinchZoom,
  wheelZoomFactor,
  zoomAt,
} from '@/shared/lib/imageZoom';

const viewport = { width: 1000, height: 800 };
const base = { width: 800, height: 600 };

describe('imageZoom', () => {
  it('keeps the scale between fitted and 8x', () => {
    expect(clampScale(0.2)).toBe(MIN_ZOOM);
    expect(clampScale(20)).toBe(MAX_ZOOM);
    expect(clampScale(3)).toBe(3);
    expect(clampScale(Number.NaN)).toBe(MIN_ZOOM);
  });

  it('centres a picture that fits and stops a zoomed one at its edges', () => {
    expect(clampOffset({ scale: 1, x: 120, y: -50 }, viewport, base)).toEqual(RESTING_ZOOM);
    // 2x: 1600x1200 on a 1000x800 stage — 300px of slack left/right, 200px up/down.
    expect(clampOffset({ scale: 2, x: 999, y: -999 }, viewport, base)).toEqual({ scale: 2, x: 300, y: -200 });
    expect(clampOffset({ scale: 2, x: 120, y: 40 }, viewport, base)).toEqual({ scale: 2, x: 120, y: 40 });
  });

  it('zooms around the cursor: the point under it stays under it', () => {
    const focus = { x: 200, y: 100 };
    const next = zoomAt(RESTING_ZOOM, 2, focus, viewport, base);
    expect(next.scale).toBe(2);
    // The picture point under the cursor was 200,100 from the picture centre;
    // at 2x it sits at translate + 2 * (200,100) — still the cursor.
    expect(next.x + 2 * 200).toBe(focus.x);
    expect(next.y + 2 * 100).toBe(focus.y);
  });

  it('zooming back out to fitted re-centres the picture', () => {
    const zoomed = zoomAt(RESTING_ZOOM, 3, { x: 300, y: 200 }, viewport, base);
    expect(zoomAt(zoomed, 1, { x: -100, y: 0 }, viewport, base)).toEqual(RESTING_ZOOM);
  });

  it('turns wheel deltas into a bounded zoom factor', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
    // Line mode counts as pixels, and a huge flick is capped like a normal one.
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-48));
    expect(wheelZoomFactor(-5000)).toBe(wheelZoomFactor(-100));
  });

  it('pinch follows the finger distance and pans with the midpoint', () => {
    const start = { state: RESTING_ZOOM, distance: 100, midpoint: { x: 0, y: 0 } };
    expect(pinchZoom(start, 200, { x: 0, y: 0 }, viewport, base)).toEqual({ scale: 2, x: 0, y: 0 });
    const moved = pinchZoom(start, 200, { x: 50, y: -20 }, viewport, base);
    expect(moved).toEqual({ scale: 2, x: 50, y: -20 });
    // Pinching in past fitted snaps back to the resting picture.
    expect(pinchZoom(start, 40, { x: 50, y: 50 }, viewport, base)).toEqual(RESTING_ZOOM);
  });

  it('knows when the picture is zoomed in', () => {
    expect(isZoomed(RESTING_ZOOM)).toBe(false);
    expect(isZoomed({ scale: 1.2, x: 0, y: 0 })).toBe(true);
  });
});
