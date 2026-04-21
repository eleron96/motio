import React from 'react';
import { GroupMode } from '@/features/planner/types/planner';
import { TimelineDisplayRow } from '@/features/planner/lib/timelineSelectors';
import { cn } from '@/shared/lib/classNames';
import { UserAvatar, AvatarSize } from '@/shared/ui/UserAvatar';

interface TimelineSidebarRowProps {
  row: TimelineDisplayRow;
  width: string;
  isMobile: boolean;
  isMobileAssigneeTimeline: boolean;
  sidebarViewportWidth: number;
  groupMode: GroupMode;
  getMonogram: (name: string) => string;
  getAvatarInfo: (id: string) => { avatarUrl: string | null; userId: string };
}

export const ASSIGNEE_AVATAR_TIER_BREAKPOINTS = {
  medium: 140,
  wide: 220,
} as const;

export const resolveAssigneeAvatarSize = (sidebarWidth: number): AvatarSize => {
  if (sidebarWidth >= ASSIGNEE_AVATAR_TIER_BREAKPOINTS.wide) return '2xl';
  if (sidebarWidth >= ASSIGNEE_AVATAR_TIER_BREAKPOINTS.medium) return 'xl';
  return 'sm';
};

export const resolveAssigneeMinRowHeight = (sidebarWidth: number): number => {
  if (sidebarWidth >= ASSIGNEE_AVATAR_TIER_BREAKPOINTS.wide) return 104;
  if (sidebarWidth >= ASSIGNEE_AVATAR_TIER_BREAKPOINTS.medium) return 92;
  return 76;
};

export const TimelineSidebarRow: React.FC<TimelineSidebarRowProps> = ({
  row,
  width,
  isMobile,
  isMobileAssigneeTimeline,
  sidebarViewportWidth,
  groupMode,
  getMonogram,
  getAvatarInfo,
}) => {
  const isAssignee = groupMode === 'assignee';
  const showAssigneeAvatar = isAssignee && row.id !== 'unassigned';
  const avatarSize: AvatarSize = resolveAssigneeAvatarSize(sidebarViewportWidth);

  return (
    <div
      data-testid={`timeline-sidebar-row-${row.id}`}
      data-timeline-sidebar="row"
      className="sticky left-0 z-10 flex-shrink-0 border-r border-border bg-timeline-header"
      style={{ width, height: row.height }}
    >
      <div
        className={cn(
          'flex h-full border-b border-border transition-colors box-border hover:bg-timeline-row-hover',
          isAssignee
            ? cn(
                'flex-col items-center justify-center gap-1 py-2',
                isMobileAssigneeTimeline ? 'px-1.5' : isMobile ? 'px-2' : 'px-3',
              )
            : cn(
                'items-center gap-2',
                isMobile ? 'px-3' : 'px-4',
              ),
        )}
      >
        {isAssignee ? (
          <>
            {showAssigneeAvatar ? (() => {
              const { avatarUrl, userId } = getAvatarInfo(row.id);
              return (
                <UserAvatar
                  size={avatarSize}
                  initials={getMonogram(row.name)}
                  avatarUrl={avatarUrl}
                  colorSeed={userId}
                  showInitialsOverlay
                  className="flex-shrink-0"
                />
              );
            })() : null}
            <span
              className={cn(
                'w-full text-center font-medium text-foreground whitespace-normal break-words [overflow-wrap:anywhere] leading-tight',
                isMobile ? 'text-[11px]' : 'text-xs',
              )}
              title={row.name}
            >
              {row.name}
            </span>
          </>
        ) : (
          <div className="min-w-0 flex flex-1 items-center gap-3">
            {row.color && (
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span
              className="min-w-0 font-medium text-foreground whitespace-normal break-words [overflow-wrap:anywhere] text-sm leading-snug line-clamp-2"
              title={row.name}
            >
              {row.name}
            </span>
          </div>
        )}
        {groupMode === 'project' && (
          <span className="shrink-0 pl-2 text-xs text-muted-foreground">
            {row.tasks.length}
          </span>
        )}
      </div>
    </div>
  );
};
