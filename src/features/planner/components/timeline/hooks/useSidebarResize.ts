import React, { useCallback, useEffect, useRef, useState } from 'react';

const clampWidth = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

interface UseSidebarResizeOptions {
  sidebarContainerRef: React.RefObject<HTMLDivElement>;
  sidebarMinWidth: number;
  sidebarMaxWidth: number;
  onSidebarWidthChange?: (width: number) => void;
  onSidebarWidthReset?: () => void;
}

interface UseSidebarResizeResult {
  isSidebarResizing: boolean;
  handleSidebarResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleSidebarResizeReset: () => void;
}

export function useSidebarResize({
  sidebarContainerRef,
  sidebarMinWidth,
  sidebarMaxWidth,
  onSidebarWidthChange,
  onSidebarWidthReset,
}: UseSidebarResizeOptions): UseSidebarResizeResult {
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);

  useEffect(() => {
    if (!isSidebarResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = sidebarResizeRef.current;
      if (!resizeState || !onSidebarWidthChange) return;
      const deltaX = event.clientX - resizeState.startX;
      onSidebarWidthChange(clampWidth(resizeState.startWidth + deltaX, sidebarMinWidth, sidebarMaxWidth));
    };

    const handleMouseUp = () => {
      sidebarResizeRef.current = null;
      setIsSidebarResizing(false);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [isSidebarResizing, onSidebarWidthChange, sidebarMaxWidth, sidebarMinWidth]);

  const handleSidebarResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSidebarWidthChange) return;
    const currentWidth = sidebarContainerRef.current?.getBoundingClientRect().width ?? sidebarMinWidth;
    sidebarResizeRef.current = { startX: event.clientX, startWidth: currentWidth };
    setIsSidebarResizing(true);
    if (typeof document !== 'undefined') {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    event.preventDefault();
  }, [onSidebarWidthChange, sidebarContainerRef, sidebarMinWidth]);

  const handleSidebarResizeReset = useCallback(() => {
    onSidebarWidthReset?.();
  }, [onSidebarWidthReset]);

  return { isSidebarResizing, handleSidebarResizeStart, handleSidebarResizeReset };
}
