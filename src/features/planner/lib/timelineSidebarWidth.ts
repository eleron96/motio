import { SIDEBAR_WIDTH } from '@/features/planner/lib/dateUtils';
import type { GroupMode } from '@/features/planner/types/planner';

const TIMELINE_SIDEBAR_MIN_WIDTH = SIDEBAR_WIDTH;
const TIMELINE_SIDEBAR_MAX_WIDTH = 520;
const TIMELINE_SIDEBAR_AUTO_MAX_WIDTH = 360;
const TIMELINE_MOBILE_PROJECT_SIDEBAR_MIN_WIDTH = 120;
const TIMELINE_MOBILE_PROJECT_SIDEBAR_MAX_WIDTH = 164;
const TIMELINE_MOBILE_PROJECT_SIDEBAR_AUTO_MAX_WIDTH = 152;
const TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MIN_WIDTH = 48;
const TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MAX_WIDTH = 64;
const TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_AUTO_MAX_WIDTH = 56;

const clampTimelineSidebarWidth = (
  value: number,
  minWidth: number,
  maxWidth: number,
) => (
  Math.max(minWidth, Math.min(maxWidth, value))
);

/**
 * How wide the timeline's sidebar column is: the width the person dragged it
 * to (kept within bounds), or, until they do, a share of the screen. A phone
 * gets narrower bounds, narrowest for the avatar-only people column.
 */
export const resolveTimelineSidebarWidth = ({
  sidebarWidth,
  isMobile,
  groupMode,
}: {
  sidebarWidth: number | null;
  isMobile: boolean;
  groupMode: GroupMode;
}) => {
  const isMobileAssigneeTimeline = isMobile && groupMode === 'assignee';
  const sidebarMinWidth = isMobile
    ? (groupMode === 'assignee' ? TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MIN_WIDTH : TIMELINE_MOBILE_PROJECT_SIDEBAR_MIN_WIDTH)
    : TIMELINE_SIDEBAR_MIN_WIDTH;
  const sidebarMaxWidth = isMobile
    ? (groupMode === 'assignee' ? TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_MAX_WIDTH : TIMELINE_MOBILE_PROJECT_SIDEBAR_MAX_WIDTH)
    : TIMELINE_SIDEBAR_MAX_WIDTH;
  const sidebarAutoMaxWidth = isMobile
    ? (groupMode === 'assignee' ? TIMELINE_MOBILE_ASSIGNEE_SIDEBAR_AUTO_MAX_WIDTH : TIMELINE_MOBILE_PROJECT_SIDEBAR_AUTO_MAX_WIDTH)
    : TIMELINE_SIDEBAR_AUTO_MAX_WIDTH;
  const resolvedSidebarWidth = typeof sidebarWidth === 'number' && Number.isFinite(sidebarWidth)
    ? `${clampTimelineSidebarWidth(sidebarWidth, sidebarMinWidth, sidebarMaxWidth)}px`
    : `clamp(${sidebarMinWidth}px, ${isMobileAssigneeTimeline ? '14vw' : isMobile ? '38vw' : '26vw'}, ${sidebarAutoMaxWidth}px)`;
  return { isMobileAssigneeTimeline, sidebarMinWidth, sidebarMaxWidth, resolvedSidebarWidth };
};
