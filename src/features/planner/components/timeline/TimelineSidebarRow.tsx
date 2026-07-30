import React from 'react';
import { GroupMode } from '@/features/planner/types/planner';
import { TimelineDisplayRow } from '@/features/planner/lib/timelineSelectors';
import { cn } from '@/shared/lib/classNames';
import { UserAvatar, AvatarSize } from '@/shared/ui/UserAvatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { AssigneeProfileCard } from './AssigneeProfileCard';

interface TimelineSidebarRowProps {
  row: TimelineDisplayRow;
  width: string;
  isMobile: boolean;
  isMobileAssigneeTimeline: boolean;
  sidebarViewportWidth: number;
  groupMode: GroupMode;
  getMonogram: (name: string) => string;
  getAvatarInfo: (id: string) => { avatarUrl: string | null; userId: string; email: string | null };
}

export const ASSIGNEE_AVATAR_TIER_BREAKPOINTS = {
  compact: 80,
  medium: 140,
  wide: 220,
} as const;

export const resolveAssigneeAvatarSize = (sidebarWidth: number): AvatarSize => {
  if (sidebarWidth >= ASSIGNEE_AVATAR_TIER_BREAKPOINTS.wide) return 'lg';
  if (sidebarWidth >= ASSIGNEE_AVATAR_TIER_BREAKPOINTS.medium) return '2xl';
  return 'xl';
};

export const resolveAssigneeMinRowHeight = (sidebarWidth: number): number => {
  if (sidebarWidth >= ASSIGNEE_AVATAR_TIER_BREAKPOINTS.wide) return 128;
  if (sidebarWidth >= ASSIGNEE_AVATAR_TIER_BREAKPOINTS.medium) return 104;
  if (sidebarWidth >= ASSIGNEE_AVATAR_TIER_BREAKPOINTS.compact) return 88;
  return 72;
};

// Shared styling for the avatar-click profile popover (desktop and mobile).
// Wide enough for the enlarged photo inside AssigneeProfileCard, still capped
// against the viewport so it never overruns a phone screen.
const PROFILE_POPOVER_CLASS = 'w-auto min-w-[12rem] max-w-[min(28rem,92vw)] px-5 py-4';
const AVATAR_TRIGGER_CLASS =
  'flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

const TimelineSidebarRowBase: React.FC<TimelineSidebarRowProps> = ({
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
      className={cn(
        'sticky left-0 z-10 flex-shrink-0 border-r border-border bg-timeline-header',
      )}
      style={{ width, height: row.height }}
    >
      <div
        className={cn(
          'flex h-full box-border transition-colors',
          isMobileAssigneeTimeline
            ? 'items-center justify-center'
            : cn(
                'border-b border-border hover:bg-timeline-row-hover',
                isAssignee
                  ? cn('flex-col items-center justify-center gap-1 py-2', isMobile ? 'px-2' : 'px-3')
                  : cn('items-center gap-2', isMobile ? 'px-3' : 'px-4'),
              ),
        )}
      >
        {isMobileAssigneeTimeline ? (
          showAssigneeAvatar ? (
            (() => {
              const { avatarUrl, userId, email } = getAvatarInfo(row.id);
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={row.name}
                      className={AVATAR_TRIGGER_CLASS}
                    >
                      <UserAvatar
                        size="sm"
                        initials={getMonogram(row.name)}
                        avatarUrl={avatarUrl}
                        colorSeed={userId}
                        showInitialsOverlay
                        className="shadow-sm ring-1 ring-border/60"
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="center" className={PROFILE_POPOVER_CLASS}>
                    <AssigneeProfileCard
                      name={row.name}
                      email={email}
                      avatarUrl={avatarUrl}
                      colorSeed={userId}
                      initials={getMonogram(row.name)}
                    />
                  </PopoverContent>
                </Popover>
              );
            })()
          ) : null
        ) : isAssignee ? (
          <>
            {showAssigneeAvatar ? (() => {
              const { avatarUrl, userId, email } = getAvatarInfo(row.id);
              return (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={row.name}
                      className={AVATAR_TRIGGER_CLASS}
                    >
                      <UserAvatar
                        size={avatarSize}
                        initials={getMonogram(row.name)}
                        avatarUrl={avatarUrl}
                        colorSeed={userId}
                        showInitialsOverlay
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="center" className={PROFILE_POPOVER_CLASS}>
                    <AssigneeProfileCard
                      name={row.name}
                      email={email}
                      avatarUrl={avatarUrl}
                      colorSeed={userId}
                      initials={getMonogram(row.name)}
                    />
                  </PopoverContent>
                </Popover>
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
        {!isMobileAssigneeTimeline && groupMode === 'project' && (
          <span className="shrink-0 pl-2 text-xs text-muted-foreground">
            {row.tasks.length}
          </span>
        )}
      </div>
    </div>
  );
};

// Rendered once per row and re-created on every scroll tick by TimelineGrid. Its
// props (row, width, callbacks) are stable across a scroll, so memoizing skips
// re-rendering every sidebar row when only the scroll position changed.
export const TimelineSidebarRow = React.memo(TimelineSidebarRowBase);
TimelineSidebarRow.displayName = 'TimelineSidebarRow';
