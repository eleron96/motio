import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Render only the timeline rows that intersect the vertical viewport plus an
// overscan band. Rows outside the window are replaced by two spacer blocks so
// the scrollbar geometry stays identical to a full render.
//
// Scroll position is quantized into buckets: the rendered slice changes only
// when the user crosses a bucket boundary, not on every scrolled pixel.
const SCROLL_BUCKET_PX = 240;
const OVERSCAN_PX = 1000;
// While the viewport stays this far inside the committed overscan band, window
// shifts run as interruptible transitions (cheap prefetch). Once the viewport
// drifts closer to the band's edge than this, the shift becomes urgent —
// otherwise continuous scrolling starves the transition and the user reaches
// blank spacer space.
const URGENT_EDGE_PX = SCROLL_BUCKET_PX * 2;

type RowLike = { id: string; height: number };

interface UseVirtualRowWindowParams<Row extends RowLike> {
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  rows: Row[];
}

interface UseVirtualRowWindowResult<Row extends RowLike> {
  visibleRows: Row[];
  // Absolute index of visibleRows[0] within the full rows array.
  firstRowIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  viewportHeight: number;
  // Top offset of a row inside the rows region (excludes the header block).
  getRowOffset: (rowId: string) => number | null;
  handleScrollTopChange: (scrollTop: number) => void;
}

export function useVirtualRowWindow<Row extends RowLike>({
  scrollContainerRef,
  rows,
}: UseVirtualRowWindowParams<Row>): UseVirtualRowWindowResult<Row> {
  const [scrollTopBucket, setScrollTopBucket] = useState(0);
  // Before the first measurement (and in jsdom, where clientHeight is 0) fall
  // back to the window height so the initial render covers a real viewport.
  const [viewportHeight, setViewportHeight] = useState(() => (
    typeof window !== 'undefined' ? window.innerHeight : 0
  ));

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return undefined;

    const updateHeight = () => {
      const fallback = typeof window !== 'undefined' ? window.innerHeight : 0;
      const next = container.clientHeight || fallback;
      setViewportHeight((prev) => (prev === next ? prev : next));
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(container);
      return () => observer.disconnect();
    }
    return undefined;
    // scrollContainerRef is a stable ref — intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirrors of committed state, so the scroll handler can stay referentially
  // stable while still reading the latest rendered window.
  const committedBucketRef = useRef(0);
  const viewportHeightRef = useRef(viewportHeight);
  useEffect(() => {
    committedBucketRef.current = scrollTopBucket;
    viewportHeightRef.current = viewportHeight;
  });

  const handleScrollTopChange = useCallback((scrollTop: number) => {
    const bucket = Math.max(0, Math.floor(scrollTop / SCROLL_BUCKET_PX));
    if (bucket === committedBucketRef.current) return;

    // How far the live scroll position has drifted from the anchor of the
    // currently COMMITTED window (not the pending one — transitions may never
    // commit while scroll events keep arriving).
    const committedAnchor = committedBucketRef.current * SCROLL_BUCKET_PX;
    const drift = Math.abs(scrollTop - committedAnchor);

    if (drift > OVERSCAN_PX - URGENT_EDGE_PX) {
      // Viewport is about to leave the mounted band: render synchronously so
      // the user never scrolls into blank spacer space.
      setScrollTopBucket((prev) => (prev === bucket ? prev : bucket));
      return;
    }

    // Still well inside the band: prefetch the shifted window as a transition
    // so mounting the entering rows never blocks the scroll frame.
    startTransition(() => {
      setScrollTopBucket((prev) => (prev === bucket ? prev : bucket));
    });
  }, []);

  const rowGeometry = useMemo(() => {
    const offsets = new Array<number>(rows.length);
    const offsetById = new Map<string, number>();
    let total = 0;
    for (let index = 0; index < rows.length; index += 1) {
      offsets[index] = total;
      offsetById.set(rows[index].id, total);
      total += rows[index].height;
    }
    return { offsets, offsetById, total };
  }, [rows]);

  const range = useMemo(() => {
    if (rows.length === 0) return { start: 0, end: -1 };

    const windowStart = Math.max(0, scrollTopBucket * SCROLL_BUCKET_PX - OVERSCAN_PX);
    const windowEnd = scrollTopBucket * SCROLL_BUCKET_PX + viewportHeight + OVERSCAN_PX;

    let start = 0;
    while (
      start < rows.length - 1
      && rowGeometry.offsets[start] + rows[start].height < windowStart
    ) {
      start += 1;
    }

    let end = start;
    while (end < rows.length - 1 && rowGeometry.offsets[end + 1] < windowEnd) {
      end += 1;
    }

    return { start, end };
  }, [rowGeometry, rows, scrollTopBucket, viewportHeight]);

  const visibleRows = useMemo(
    () => (range.end < range.start ? [] : rows.slice(range.start, range.end + 1)),
    [range.end, range.start, rows],
  );

  const topSpacerHeight = range.end < range.start ? 0 : rowGeometry.offsets[range.start];
  const bottomSpacerHeight = range.end < range.start
    ? 0
    : rowGeometry.total - (rowGeometry.offsets[range.end] + rows[range.end].height);

  const getRowOffset = useCallback(
    (rowId: string) => rowGeometry.offsetById.get(rowId) ?? null,
    [rowGeometry],
  );

  return {
    visibleRows,
    firstRowIndex: range.start,
    topSpacerHeight,
    bottomSpacerHeight,
    viewportHeight,
    getRowOffset,
    handleScrollTopChange,
  };
}
