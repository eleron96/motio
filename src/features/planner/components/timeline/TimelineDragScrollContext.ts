import { createContext, useContext } from 'react';
import type { ViewportBounds } from '@/features/planner/lib/dragAutoScroll';

export type TaskDragEdge = 'left' | 'right' | null;

export interface TaskDragState {
  /** A task bar is being dragged or resized (after the click threshold). */
  active: boolean;
  /** Which edge strip is currently scrolling the timeline, if any. */
  edge: TaskDragEdge;
}

/**
 * What a dragged task bar needs from the timeline grid: the scroll container
 * to push along, the client-space bounds of the date area for edge detection,
 * and a way to report its state so the grid can light up the edge strips and
 * hold off re-anchoring the date range mid-drag.
 */
export interface TimelineDragScrollController {
  getScrollContainer: () => HTMLDivElement | null;
  getViewportBounds: () => ViewportBounds | null;
  setTaskDragState: (state: TaskDragState) => void;
}

export const IDLE_TASK_DRAG_STATE: TaskDragState = { active: false, edge: null };

const noopController: TimelineDragScrollController = {
  getScrollContainer: () => null,
  getViewportBounds: () => null,
  setTaskDragState: () => {},
};

/** Defaults to a no-op so a bar rendered outside the grid (tests, previews)
 *  still drags within the screen exactly as before. */
export const TimelineDragScrollContext = createContext<TimelineDragScrollController>(noopController);

export const useTimelineDragScroll = () => useContext(TimelineDragScrollContext);
