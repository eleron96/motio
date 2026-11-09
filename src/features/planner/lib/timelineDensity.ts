import {
  MIN_ROW_HEIGHT,
  ROW_BOTTOM_SPACE,
  ROW_TOP_PADDING,
  TASK_GAP,
  TASK_HEIGHT,
} from '@/features/planner/lib/dateUtils';

// Timeline density (server setting timeline.density, chosen per workspace by
// its admins, workspaces.timeline_density, migration 0180). Computers only:
// phones keep the usual layout.
//
//   normal        — as Motio always looked: large photos, two-line bars.
//   small_photos  — a small photo next to the name, so a row is as low as its
//                   bars allow (a row with one bar: 92 px instead of 104–128).
//   compact       — small photos and one-line bars of 26 px: about twice as
//                   many people on screen.

export const TIMELINE_DENSITIES = ['normal', 'small_photos', 'compact'] as const;
export type TimelineDensity = (typeof TIMELINE_DENSITIES)[number];

export type TimelineGeometry = {
  taskHeight: number;
  taskGap: number;
  rowTopPadding: number;
  /** Free strip under the last bar: double-click there adds a task. */
  rowBottomSpace: number;
  minRowHeight: number;
  /** Large photos in the people column, sized by its width (normal only). */
  tieredAvatars: boolean;
  /** Title and project on two lines; one line in compact. */
  twoLineBars: boolean;
};

// The very constants the timeline has always used — one object, so passing it
// down changes no memoized comparison.
export const NORMAL_TIMELINE_GEOMETRY: TimelineGeometry = Object.freeze({
  taskHeight: TASK_HEIGHT,
  taskGap: TASK_GAP,
  rowTopPadding: ROW_TOP_PADDING,
  rowBottomSpace: ROW_BOTTOM_SPACE,
  minRowHeight: MIN_ROW_HEIGHT,
  tieredAvatars: true,
  twoLineBars: true,
});

export const TIMELINE_GEOMETRY: Record<TimelineDensity, TimelineGeometry> = {
  normal: NORMAL_TIMELINE_GEOMETRY,
  small_photos: Object.freeze({ ...NORMAL_TIMELINE_GEOMETRY, tieredAvatars: false }),
  compact: Object.freeze({
    taskHeight: 26,
    taskGap: 3,
    rowTopPadding: 4,
    rowBottomSpace: 14,
    minRowHeight: 40,
    tieredAvatars: false,
    twoLineBars: false,
  }),
};

export const isTimelineDensity = (value: unknown): value is TimelineDensity => (
  typeof value === 'string' && (TIMELINE_DENSITIES as readonly string[]).includes(value)
);
