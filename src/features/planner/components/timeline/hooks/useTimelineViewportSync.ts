import { useEffect, useMemo } from 'react';
import { format } from 'date-fns';

interface UseTimelineViewportSyncOptions {
  visibleDays: Date[];
  dayWidth: number;
  scrollLeft: number;
  viewportWidth: number;
  sidebarViewportWidth: number;
  leftContextDays: number;
  todayKey: string;
  setVisibleCenterDate: (date: string) => void;
  setSearchViewport: (
    viewport: { start: string; end: string },
    loaded: { start: string; end: string },
    sidebarWidth: number,
  ) => void;
}

/**
 * Tells the rest of the planner what the timeline shows: the day in focus,
 * the days on screen for the search strip, and whether today has scrolled out
 * of view (the "Today" button).
 */
export const useTimelineViewportSync = ({
  visibleDays,
  dayWidth,
  scrollLeft,
  viewportWidth,
  sidebarViewportWidth,
  leftContextDays,
  todayKey,
  setVisibleCenterDate,
  setSearchViewport,
}: UseTimelineViewportSyncOptions) => {
  const focusIndex = useMemo(() => {
    if (!viewportWidth || dayWidth === 0) return -1;
    const focusPx = scrollLeft + leftContextDays * dayWidth + dayWidth / 2;
    return Math.min(visibleDays.length - 1, Math.max(0, Math.floor(focusPx / dayWidth)));
  }, [scrollLeft, viewportWidth, dayWidth, visibleDays.length, leftContextDays]);

  useEffect(() => {
    if (focusIndex >= 0 && focusIndex < visibleDays.length) {
      setVisibleCenterDate(format(visibleDays[focusIndex], 'yyyy-MM-dd'));
    }
  }, [focusIndex, visibleDays, setVisibleCenterDate]);

  // The search strip and its "earlier / later" chips need the days on screen.
  useEffect(() => {
    if (!viewportWidth || dayWidth === 0 || visibleDays.length === 0) return;
    const first = Math.min(visibleDays.length - 1, Math.max(0, Math.floor(scrollLeft / dayWidth)));
    const last = Math.min(visibleDays.length - 1, Math.max(first, Math.floor((scrollLeft + viewportWidth - 1) / dayWidth)));
    setSearchViewport(
      { start: format(visibleDays[first], 'yyyy-MM-dd'), end: format(visibleDays[last], 'yyyy-MM-dd') },
      { start: format(visibleDays[0], 'yyyy-MM-dd'), end: format(visibleDays[visibleDays.length - 1], 'yyyy-MM-dd') },
      sidebarViewportWidth,
    );
  }, [dayWidth, scrollLeft, setSearchViewport, sidebarViewportWidth, viewportWidth, visibleDays]);

  const showTodayButton = useMemo(() => {
    if (!viewportWidth || dayWidth === 0 || visibleDays.length === 0) return false;
    const todayIndex = visibleDays.findIndex((day) => format(day, 'yyyy-MM-dd') === todayKey);
    if (todayIndex < 0) return true;
    const todayStart = todayIndex * dayWidth;
    const todayEnd = todayStart + dayWidth;
    const viewportStart = scrollLeft;
    const viewportEnd = scrollLeft + viewportWidth;
    return todayEnd <= viewportStart || todayStart >= viewportEnd;
  }, [dayWidth, scrollLeft, todayKey, viewportWidth, visibleDays]);

  return showTodayButton;
};
