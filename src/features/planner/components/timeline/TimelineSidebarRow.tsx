import React from 'react';
import { GroupMode } from '@/features/planner/types/planner';
import { TimelineDisplayRow } from '@/features/planner/lib/timelineSelectors';
import { cn } from '@/shared/lib/classNames';
import { UserAvatar } from '@/shared/ui/UserAvatar';

interface TimelineSidebarRowProps {
  row: TimelineDisplayRow;
  width: string;
  isMobile: boolean;
  isMobileAssigneeTimeline: boolean;
  groupMode: GroupMode;
  getMonogram: (name: string) => string;
  getAvatarInfo: (id: string) => { avatarUrl: string | null; userId: string };
}

export const TimelineSidebarRow: React.FC<TimelineSidebarRowProps> = ({
  row,
  width,
  isMobile,
  isMobileAssigneeTimeline,
  groupMode,
  getMonogram,
  getAvatarInfo,
}) => (
  <div
    data-testid={`timeline-sidebar-row-${row.id}`}
    data-timeline-sidebar="row"
    className="sticky left-0 z-10 flex-shrink-0 border-r border-border bg-timeline-header"
    style={{ width, height: row.height }}
  >
    <div
      className={cn(
        'flex h-full items-center gap-2 border-b border-border transition-colors box-border hover:bg-timeline-row-hover',
        isMobileAssigneeTimeline ? 'justify-center px-1.5' : isMobile ? 'px-3' : 'px-4',
      )}
    >
      <div className={cn(
        'min-w-0 flex flex-1 items-center gap-3',
        isMobileAssigneeTimeline && 'justify-center',
      )}>
        {row.color && (
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: row.color }}
          />
        )}
        {isMobileAssigneeTimeline ? (
          <UserAvatar
            size="sm"
            initials={getMonogram(row.name)}
            avatarUrl={groupMode === 'assignee' ? getAvatarInfo(row.id).avatarUrl : null}
            colorSeed={groupMode === 'assignee' ? getAvatarInfo(row.id).userId : row.id}
            showInitialsOverlay
            className="border border-border flex-shrink-0"
          />
        ) : (
          <>
            {groupMode === 'assignee' && row.id !== 'unassigned' && (() => {
              const { avatarUrl, userId } = getAvatarInfo(row.id);
              return (
                <UserAvatar
                  size="xs"
                  initials={getMonogram(row.name)}
                  avatarUrl={avatarUrl}
                  colorSeed={userId}
                  showInitialsOverlay
                  className="flex-shrink-0"
                />
              );
            })()}
            <span
              className={cn(
                'min-w-0 font-medium text-foreground whitespace-normal break-words [overflow-wrap:anywhere]',
                isMobile && groupMode === 'assignee'
                  ? 'text-xs leading-5 line-clamp-1'
                  : 'text-sm leading-snug line-clamp-2',
              )}
              title={row.name}
            >
              {row.name}
            </span>
          </>
        )}
      </div>
      {groupMode === 'project' && (
        <span className="shrink-0 pl-2 text-xs text-muted-foreground">
          {row.tasks.length}
        </span>
      )}
    </div>
  </div>
);
