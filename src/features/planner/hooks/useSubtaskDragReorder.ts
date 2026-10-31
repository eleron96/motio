import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  resolveSubtaskDropIndex,
  resolveSubtaskShiftOffsets,
  SubtaskRowBox,
} from '@/shared/domain/taskSubtaskOrder';

/** How long rows take to slide aside, and the dropped one into its slot. */
export const SUBTASK_REORDER_ANIMATION_MS = 160;

interface DragState {
  id: string;
  fromIndex: number;
  toIndex: number;
  offsetY: number;
  /** Rows as measured when the drag started, in list order. */
  boxes: SubtaskRowBox[];
  /** Released: the row glides into its slot, then the new order is applied. */
  settling: boolean;
}

interface UseSubtaskDragReorderParams {
  ids: string[];
  enabled: boolean;
  onReorder: (subtaskId: string, toIndex: number) => void;
}

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

/**
 * Drag-to-reorder for the subtask list, by a handle on each row.
 *
 * While dragging, the row follows the pointer and the rows it passes slide
 * aside; on release it glides into its new slot and only then the new order
 * is handed to `onReorder`, so the list never jumps. Arrow keys on the handle
 * move a row by one place.
 */
export const useSubtaskDragReorder = ({ ids, enabled, onReorder }: UseSubtaskDragReorderParams) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const rowsRef = useRef(new Map<string, HTMLElement>());
  const gestureRef = useRef<{ pointerId: number; startY: number } | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
  }, []);

  const registerRow = useCallback((id: string) => (node: HTMLElement | null) => {
    if (node) rowsRef.current.set(id, node);
    else rowsRef.current.delete(id);
  }, []);

  const finish = (state: DragState) => {
    gestureRef.current = null;
    const { boxes, fromIndex, toIndex } = state;
    // Where the row's own slot ends up once the others stepped aside.
    const landingY = toIndex > fromIndex
      ? (boxes[toIndex].top + boxes[toIndex].height) - (boxes[fromIndex].top + boxes[fromIndex].height)
      : toIndex < fromIndex
        ? boxes[toIndex].top - boxes[fromIndex].top
        : 0;
    const commit = () => {
      settleTimerRef.current = null;
      if (toIndex !== fromIndex) onReorderRef.current(state.id, toIndex);
      setDrag(null);
    };
    if (prefersReducedMotion()) {
      commit();
      return;
    }
    setDrag({ ...state, offsetY: landingY, settling: true });
    settleTimerRef.current = setTimeout(commit, SUBTASK_REORDER_ANIMATION_MS);
  };

  const handleProps = (id: string) => {
    const index = ids.indexOf(id);

    const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || drag || index < 0) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      // No text selection, no parent swipe/scroll gestures.
      event.preventDefault();
      event.stopPropagation();
      // Not implemented in jsdom, and absent on some older mobile engines.
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      const boxes = ids.map((rowId) => {
        const rect = rowsRef.current.get(rowId)?.getBoundingClientRect();
        return { top: rect?.top ?? 0, height: rect?.height ?? 0 };
      });
      gestureRef.current = { pointerId: event.pointerId, startY: event.clientY };
      setDrag({ id, fromIndex: index, toIndex: index, offsetY: 0, boxes, settling: false });
    };

    const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || !drag || drag.settling) return;
      const offsetY = event.clientY - gesture.startY;
      const toIndex = resolveSubtaskDropIndex(drag.boxes, drag.fromIndex, offsetY);
      setDrag({ ...drag, offsetY, toIndex });
    };

    const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || !drag || drag.settling) return;
      finish(drag);
    };

    const onPointerCancel = () => {
      if (!drag || drag.settling) return;
      finish({ ...drag, toIndex: drag.fromIndex });
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
      if (!enabled || drag || index < 0) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const toIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (toIndex < 0 || toIndex >= ids.length) return;
      onReorderRef.current(id, toIndex);
    };

    return {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onKeyDown,
      // Keeps the phone's back swipe away from the handle.
      'data-swipe-ignore': '',
    };
  };

  const shifts = drag ? resolveSubtaskShiftOffsets(drag.boxes, drag.fromIndex, drag.toIndex) : null;

  /** Inline style of a row: where it is drawn while a drag is going on. */
  const rowStyle = (id: string): React.CSSProperties | undefined => {
    if (!drag) return undefined;
    const transition = `transform ${SUBTASK_REORDER_ANIMATION_MS}ms ease, box-shadow ${SUBTASK_REORDER_ANIMATION_MS}ms ease`;
    if (id === drag.id) {
      return {
        transform: `translateY(${drag.offsetY}px)`,
        transition: drag.settling ? transition : 'box-shadow 120ms ease',
        position: 'relative',
        zIndex: 10,
      };
    }
    const shift = shifts?.[ids.indexOf(id)] ?? 0;
    return { transform: `translateY(${shift}px)`, transition };
  };

  /** The row's number as it would be if dropped now (live while dragging). */
  const displayIndex = (id: string): number => {
    const index = ids.indexOf(id);
    if (!drag) return index;
    if (id === drag.id) return drag.toIndex;
    const shift = shifts?.[index] ?? 0;
    return index + (shift < 0 ? -1 : shift > 0 ? 1 : 0);
  };

  return {
    draggingId: drag?.id ?? null,
    isSettling: drag?.settling ?? false,
    registerRow,
    handleProps,
    rowStyle,
    displayIndex,
  };
};
