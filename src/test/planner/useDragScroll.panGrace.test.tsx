import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useDragScroll } from '@/features/planner/components/timeline/hooks/useDragScroll';
import { PAN_GRACE_MS } from '@/features/planner/lib/panGrace';

// Manual animation frames so a pan stroke applies its scroll only when asked.
const frames: FrameRequestCallback[] = [];
const runFrame = () => {
  const pending = frames.splice(0, frames.length);
  pending.forEach((callback) => callback(performance.now()));
};

const Surface = () => {
  const { handleDragStart } = useDragScroll({ markTimelineInteraction: () => {} });
  return (
    <div data-testid="surface" onMouseDown={handleDragStart}>
      <div className="task-bar" data-testid="bar" />
      <div data-timeline-sidebar data-testid="sidebar" />
    </div>
  );
};

const renderSurface = () => {
  const utils = render(<Surface />);
  const surface = utils.getByTestId('surface');
  return { ...utils, surface };
};

// One pan stroke: press, drag, release. The surface scrolls by the drag.
const panStroke = (target: HTMLElement, fromX: number, toX: number) => {
  fireEvent.mouseDown(target, { button: 0, clientX: fromX });
  fireEvent.mouseMove(window, { clientX: toX });
  act(() => runFrame());
  fireEvent.mouseUp(window);
};

describe('useDragScroll pan grace', () => {
  let now = 100_000;

  beforeEach(() => {
    frames.length = 0;
    now = 100_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not pan from a task bar when no pan just happened', () => {
    const { surface, getByTestId } = renderSurface();
    panStroke(getByTestId('bar'), 500, 400);
    expect(surface.scrollLeft).toBe(0);
  });

  it('keeps panning from a task bar on a rapid follow-up stroke', () => {
    const { surface, getByTestId } = renderSurface();
    panStroke(surface, 500, 400);
    expect(surface.scrollLeft).toBe(100);

    now += PAN_GRACE_MS - 100;
    panStroke(getByTestId('bar'), 500, 400);
    expect(surface.scrollLeft).toBe(200);
  });

  it('hands the bar back once the grace window passes', () => {
    const { surface, getByTestId } = renderSurface();
    panStroke(surface, 500, 400);

    now += PAN_GRACE_MS;
    panStroke(getByTestId('bar'), 500, 400);
    expect(surface.scrollLeft).toBe(100);
  });

  it('never pans from the sidebar, even right after a pan', () => {
    const { surface, getByTestId } = renderSurface();
    panStroke(surface, 500, 400);

    panStroke(getByTestId('sidebar'), 500, 400);
    expect(surface.scrollLeft).toBe(100);
  });
});
