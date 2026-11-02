import React, { useCallback, useEffect, useRef, useState } from 'react';

const MOBILE_DRAG_HOLD_MS = 420;
const MOBILE_DRAG_MOVE_TOLERANCE_PX = 10;
const MOBILE_DRAG_ARM_TTL_MS = 4500;

interface UseWidgetTouchReorderOptions {
  canEdit: boolean;
  /** Touch screen at a phone/tablet/laptop width: moving needs a long press. */
  isTouchReorderMode: boolean;
}

/**
 * Moving widgets on a touch screen: holding a widget header arms it for a
 * while, and only an armed header drags the grid — a plain swipe keeps
 * scrolling the page.
 */
export const useWidgetTouchReorder = ({ canEdit, isTouchReorderMode }: UseWidgetTouchReorderOptions) => {
  const [mobileDragArmedWidgetId, setMobileDragArmedWidgetId] = useState<string | null>(null);
  const [mobileDragPressingWidgetId, setMobileDragPressingWidgetId] = useState<string | null>(null);
  const mobileDragHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileDragArmResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileTouchSessionRef = useRef<{
    widgetId: string;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const clearMobileDragHoldTimer = useCallback(() => {
    if (!mobileDragHoldTimerRef.current) return;
    clearTimeout(mobileDragHoldTimerRef.current);
    mobileDragHoldTimerRef.current = null;
  }, []);

  const clearMobileDragArmResetTimer = useCallback(() => {
    if (!mobileDragArmResetTimerRef.current) return;
    clearTimeout(mobileDragArmResetTimerRef.current);
    mobileDragArmResetTimerRef.current = null;
  }, []);

  const scheduleMobileDragArmReset = useCallback(() => {
    if (!isTouchReorderMode) return;
    clearMobileDragArmResetTimer();
    mobileDragArmResetTimerRef.current = setTimeout(() => {
      setMobileDragArmedWidgetId(null);
    }, MOBILE_DRAG_ARM_TTL_MS);
  }, [clearMobileDragArmResetTimer, isTouchReorderMode]);

  const handleWidgetDragHoldStart = useCallback((
    widgetId: string,
    event: React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!canEdit || !isTouchReorderMode) return;
    if (mobileDragArmedWidgetId === widgetId) {
      setMobileDragPressingWidgetId(null);
      scheduleMobileDragArmReset();
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      setMobileDragPressingWidgetId(null);
      return;
    }
    mobileTouchSessionRef.current = {
      widgetId,
      startX: touch.clientX,
      startY: touch.clientY,
      moved: false,
    };
    setMobileDragPressingWidgetId(widgetId);
    clearMobileDragHoldTimer();
    mobileDragHoldTimerRef.current = setTimeout(() => {
      const session = mobileTouchSessionRef.current;
      if (!session || session.widgetId !== widgetId || session.moved) return;
      setMobileDragPressingWidgetId(null);
      setMobileDragArmedWidgetId(widgetId);
      scheduleMobileDragArmReset();
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }
    }, MOBILE_DRAG_HOLD_MS);
  }, [
    canEdit,
    clearMobileDragHoldTimer,
    isTouchReorderMode,
    mobileDragArmedWidgetId,
    scheduleMobileDragArmReset,
  ]);

  const handleWidgetDragHoldMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const session = mobileTouchSessionRef.current;
    if (!session || session.moved) return;
    const touch = event.touches[0];
    if (!touch) return;
    const deltaX = touch.clientX - session.startX;
    const deltaY = touch.clientY - session.startY;
    if (Math.hypot(deltaX, deltaY) >= MOBILE_DRAG_MOVE_TOLERANCE_PX) {
      session.moved = true;
      clearMobileDragHoldTimer();
      setMobileDragPressingWidgetId(null);
    }
  }, [clearMobileDragHoldTimer]);

  const handleWidgetDragHoldEnd = useCallback(() => {
    clearMobileDragHoldTimer();
    mobileTouchSessionRef.current = null;
    setMobileDragPressingWidgetId(null);
  }, [clearMobileDragHoldTimer]);

  const handleGridDragStart = useCallback(() => {
    if (!isTouchReorderMode) return;
    clearMobileDragHoldTimer();
    clearMobileDragArmResetTimer();
    mobileTouchSessionRef.current = null;
    setMobileDragPressingWidgetId(null);
    setMobileDragArmedWidgetId(null);
  }, [clearMobileDragArmResetTimer, clearMobileDragHoldTimer, isTouchReorderMode]);

  const handleGridDragStop = useCallback(() => {
    if (!isTouchReorderMode) return;
    clearMobileDragHoldTimer();
    clearMobileDragArmResetTimer();
    mobileTouchSessionRef.current = null;
    setMobileDragPressingWidgetId(null);
    setMobileDragArmedWidgetId(null);
  }, [clearMobileDragArmResetTimer, clearMobileDragHoldTimer, isTouchReorderMode]);

  useEffect(() => {
    return () => {
      clearMobileDragHoldTimer();
      clearMobileDragArmResetTimer();
    };
  }, [clearMobileDragArmResetTimer, clearMobileDragHoldTimer]);

  useEffect(() => {
    if (isTouchReorderMode && canEdit) return;
    clearMobileDragHoldTimer();
    clearMobileDragArmResetTimer();
    mobileTouchSessionRef.current = null;
    setMobileDragPressingWidgetId(null);
    setMobileDragArmedWidgetId(null);
  }, [
    canEdit,
    clearMobileDragArmResetTimer,
    clearMobileDragHoldTimer,
    isTouchReorderMode,
  ]);

  return {
    mobileDragArmedWidgetId,
    mobileDragPressingWidgetId,
    handleWidgetDragHoldStart,
    handleWidgetDragHoldMove,
    handleWidgetDragHoldEnd,
    handleGridDragStart,
    handleGridDragStop,
  };
};

export type WidgetTouchReorder = ReturnType<typeof useWidgetTouchReorder>;
