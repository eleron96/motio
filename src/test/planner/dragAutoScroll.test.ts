import { describe, expect, it } from 'vitest';
import {
  DRAG_EDGE_MAX_SPEED,
  DRAG_EDGE_MIN_SPEED,
  DRAG_EDGE_ZONE_PX,
  computeDragDeltaDays,
  getEdgeScrollVelocity,
} from '@/features/planner/lib/dragAutoScroll';

const bounds = { left: 200, right: 1000 };

describe('getEdgeScrollVelocity', () => {
  it('is idle in the middle of the date area', () => {
    expect(getEdgeScrollVelocity(600, bounds)).toBe(0);
    expect(getEdgeScrollVelocity(bounds.left + DRAG_EDGE_ZONE_PX, bounds)).toBe(0);
    expect(getEdgeScrollVelocity(bounds.right - DRAG_EDGE_ZONE_PX, bounds)).toBe(0);
  });

  it('scrolls left in the left strip and right in the right strip, faster toward the edge', () => {
    const nearInner = getEdgeScrollVelocity(bounds.left + DRAG_EDGE_ZONE_PX - 1, bounds);
    const atEdge = getEdgeScrollVelocity(bounds.left, bounds);
    expect(nearInner).toBeLessThan(0);
    expect(atEdge).toBeLessThan(nearInner);
    expect(atEdge).toBe(-DRAG_EDGE_MAX_SPEED);
    expect(Math.abs(nearInner)).toBeGreaterThanOrEqual(DRAG_EDGE_MIN_SPEED);

    expect(getEdgeScrollVelocity(bounds.right - 1, bounds)).toBeGreaterThan(0);
    expect(getEdgeScrollVelocity(bounds.right, bounds)).toBe(DRAG_EDGE_MAX_SPEED);
  });

  it('keeps full speed when the cursor leaves the window past an edge', () => {
    expect(getEdgeScrollVelocity(-500, bounds)).toBe(-DRAG_EDGE_MAX_SPEED);
    expect(getEdgeScrollVelocity(5000, bounds)).toBe(DRAG_EDGE_MAX_SPEED);
  });

  it('shrinks the strips on a narrow viewport so they never overlap', () => {
    const narrow = { left: 0, right: 90 };
    // Strips are a third of the width each: the centre stays idle.
    expect(getEdgeScrollVelocity(45, narrow)).toBe(0);
    expect(getEdgeScrollVelocity(10, narrow)).toBeLessThan(0);
    expect(getEdgeScrollVelocity(80, narrow)).toBeGreaterThan(0);
  });

  it('is idle for degenerate bounds', () => {
    expect(getEdgeScrollVelocity(10, { left: 100, right: 100 })).toBe(0);
  });
});

describe('computeDragDeltaDays', () => {
  it('adds the scroll travelled under the bar to the mouse travel', () => {
    expect(computeDragDeltaDays(10, 0, 10)).toBe(1);
    expect(computeDragDeltaDays(10, 200, 10)).toBe(21);
    expect(computeDragDeltaDays(-4, -136, 10)).toBe(-14);
  });

  it('snaps to whole days and tolerates a zero day width', () => {
    expect(computeDragDeltaDays(14, 0, 10)).toBe(1);
    expect(computeDragDeltaDays(16, 0, 10)).toBe(2);
    expect(computeDragDeltaDays(100, 0, 0)).toBe(0);
  });
});
