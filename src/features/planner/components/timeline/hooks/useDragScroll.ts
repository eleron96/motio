import React, { useCallback, useEffect, useRef, useState } from 'react';

interface UseDragScrollOptions {
  markTimelineInteraction: (ms: number) => void;
}

interface UseDragScrollResult {
  isDragScrolling: boolean;
  lastDragTimeRef: React.MutableRefObject<number>;
  handleDragStart: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function useDragScroll({ markTimelineInteraction }: UseDragScrollOptions): UseDragScrollResult {
  const dragScrollRef = useRef<{
    startX: number;
    startScrollLeft: number;
    target: HTMLDivElement | null;
    didMove: boolean;
  } | null>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const pendingDragClientXRef = useRef<number | null>(null);
  const lastDragTimeRef = useRef(0);
  const [isDragScrolling, setIsDragScrolling] = useState(false);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target;
    if (
      target instanceof Element
      && target.closest('.task-bar, .milestone-dot, .milestone-cell, [data-timeline-sidebar], [data-timeline-resize-handle]')
    ) {
      return;
    }
    dragScrollRef.current = {
      startX: e.clientX,
      startScrollLeft: e.currentTarget.scrollLeft,
      target: e.currentTarget,
      didMove: false,
    };
    pendingDragClientXRef.current = e.clientX;
    markTimelineInteraction(900);
    setIsDragScrolling(true);
    e.preventDefault();
  }, [markTimelineInteraction]);

  useEffect(() => {
    if (!isDragScrolling) return;

    const prevBodyCursor = document.body.style.cursor;
    const prevBodyUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const flushDragScroll = () => {
      dragScrollFrameRef.current = null;
      const state = dragScrollRef.current;
      const pointerX = pendingDragClientXRef.current;
      if (!state?.target || typeof pointerX !== 'number') return;
      const deltaX = pointerX - state.startX;
      if (!state.didMove && Math.abs(deltaX) > 4) {
        state.didMove = true;
      }
      state.target.scrollLeft = state.startScrollLeft - deltaX;
    };

    const scheduleDragScroll = () => {
      if (dragScrollFrameRef.current !== null) return;
      dragScrollFrameRef.current = window.requestAnimationFrame(flushDragScroll);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const state = dragScrollRef.current;
      if (!state?.target) return;
      pendingDragClientXRef.current = e.clientX;
      scheduleDragScroll();
    };

    const handleMouseUp = () => {
      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
        dragScrollFrameRef.current = null;
      }
      if (dragScrollRef.current?.didMove) {
        lastDragTimeRef.current = Date.now();
      }
      dragScrollRef.current = null;
      pendingDragClientXRef.current = null;
      setIsDragScrolling(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
        dragScrollFrameRef.current = null;
      }
      document.body.style.cursor = prevBodyCursor;
      document.body.style.userSelect = prevBodyUserSelect;
    };
  }, [isDragScrolling]);

  return { isDragScrolling, lastDragTimeRef, handleDragStart };
}
