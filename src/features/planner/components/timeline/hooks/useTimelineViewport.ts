import React, { useEffect, useState } from 'react';

interface UseTimelineViewportOptions {
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  sidebarContainerRef: React.RefObject<HTMLDivElement>;
  /**
   * Pass `resolvedSidebarWidth` here so the observer re-runs when the
   * sidebar width expression changes (e.g. after a manual resize).
   */
  sidebarWidthKey: string | number;
}

interface UseTimelineViewportResult {
  viewportWidth: number;
  sidebarViewportWidth: number;
}

export function useTimelineViewport({
  scrollContainerRef,
  sidebarContainerRef,
  sidebarWidthKey,
}: UseTimelineViewportOptions): UseTimelineViewportResult {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [sidebarViewportWidth, setSidebarViewportWidth] = useState(0);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;

    const updateDimensions = () => {
      const measuredSidebarWidth = sidebarContainerRef.current?.getBoundingClientRect().width ?? 0;
      setSidebarViewportWidth((prev) => (prev === measuredSidebarWidth ? prev : measuredSidebarWidth));
      const nextViewportWidth = Math.max(0, container.clientWidth - measuredSidebarWidth);
      setViewportWidth((prev) => (prev === nextViewportWidth ? prev : nextViewportWidth));
    };

    updateDimensions();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateDimensions);
      observer.observe(container);
      if (sidebarContainerRef.current) {
        observer.observe(sidebarContainerRef.current);
      }
      return () => observer.disconnect();
    }
    return undefined;
    // scrollContainerRef and sidebarContainerRef are stable refs — intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarWidthKey]);

  return { viewportWidth, sidebarViewportWidth };
}
