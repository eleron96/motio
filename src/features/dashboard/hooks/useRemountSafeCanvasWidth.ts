import { useCallback, useRef, useState } from 'react';

/**
 * Canvas-width tracker that survives the canvas being remounted.
 *
 * react-grid-layout's own useContainerWidth attaches its ResizeObserver to the
 * container node exactly once, but this page remounts the canvas on every
 * dashboards ↔ heatmap switch (the two views wrap it in different parents), so
 * the observer keeps watching the dead node: it reports width 0 and never
 * recovers, collapsing every widget until a full page reload. A callback ref
 * re-attaches the observer to whichever node is currently mounted instead.
 *
 * The width includes the canvas padding (clientWidth): the padding is derived
 * from this width (getDashboardCanvasMetrics), so measuring inside it fed each
 * padding change back into the next measurement and shook the grid.
 */
export const useRemountSafeCanvasWidth = (initialWidth = 1280) => {
  const [width, setWidth] = useState(initialWidth);
  const observerRef = useRef<ResizeObserver | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    setWidth(node.clientWidth || initialWidth);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        const next = node.clientWidth;
        // Ignore the 0-width blips a detaching node can emit — a real canvas
        // is never 0px wide, and latching 0 is exactly the bug this hook fixes.
        if (next > 0) setWidth(next);
      });
      observer.observe(node);
      observerRef.current = observer;
    }
  }, [initialWidth]);
  return { width, containerRef };
};
