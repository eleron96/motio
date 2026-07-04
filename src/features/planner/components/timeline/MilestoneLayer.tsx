import React, { useCallback, useRef } from 'react';
import { Milestone, Project } from '@/features/planner/types/planner';
import { TimelineMilestoneTooltipCell } from '@/features/planner/lib/timelineMilestoneSelectors';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/ui/hover-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui/context-menu';
import { hexToRgba } from '@/features/planner/lib/colorUtils';
import { format, parseISO } from 'date-fns';
import { Locale } from 'date-fns';
import { Plus } from 'lucide-react';
import { t } from '@lingui/macro';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { DEFAULT_NEUTRAL_COLOR } from '@/shared/lib/colors';

const MAX_VISIBLE_CHIPS = 2;
const MAX_VISIBLE_MOBILE_DOTS = 3;

interface MilestoneLayerProps {
  /** Width of the full timeline grid (px), used on the row container. */
  totalWidth: number;
  dayWidth: number;
  isMobile?: boolean;
  milestoneRowHeight: number;
  /** Top offset (px) of the milestone click targets inside the calendar header row. */
  milestoneHeaderRowTop: number;
  /** Height (px) of the milestone click targets inside the calendar header row. */
  milestoneHeaderRowHeight: number;
  milestoneTooltipCells: TimelineMilestoneTooltipCell[];
  visibleDays: Date[];
  projectById: Map<string, Project>;
  canEdit: boolean;
  dateLocale: Locale;
  onEditMilestone: (milestone: Milestone) => void;
  onCreateMilestone: (date: string) => void;
  onHover: (date: string, color: string) => void;
  onHoverEnd: () => void;
  /** The <TimelineHeader> element — rendered inside the header row before the milestone overlay cells. */
  children: React.ReactNode;
}

const MilestoneLayerBase: React.FC<MilestoneLayerProps> = ({
  totalWidth,
  dayWidth,
  isMobile = false,
  milestoneRowHeight,
  milestoneHeaderRowTop,
  milestoneHeaderRowHeight,
  milestoneTooltipCells,
  visibleDays,
  projectById,
  canEdit,
  dateLocale,
  onEditMilestone,
  onCreateMilestone,
  onHover,
  onHoverEnd,
  children,
}) => {
  const milestoneHeaderMenuTriggerRefs = useRef(new Map<string, HTMLButtonElement>());

  const handleMilestoneRowDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.milestone-chip')) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const dayIndex = Math.floor(offsetX / dayWidth);
    if (dayIndex < 0 || dayIndex >= visibleDays.length) return;
    const date = format(visibleDays[dayIndex], 'yyyy-MM-dd');
    onCreateMilestone(date);
    event.preventDefault();
    event.stopPropagation();
  }, [canEdit, dayWidth, onCreateMilestone, visibleDays]);

  const renderHoverBody = useCallback((date: string, dayMilestones: Milestone[]) => (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {format(parseISO(date), 'dd MMM yyyy', { locale: dateLocale })}
      </div>
      <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {dayMilestones.map((milestone) => {
          const project = projectById.get(milestone.projectId);
          const color = project?.color ?? DEFAULT_NEUTRAL_COLOR;
          const dotColor = hexToRgba(color, 0.8) ?? color;
          return (
            <button
              key={milestone.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-muted"
              onClick={() => onEditMilestone(milestone)}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
              <div className="min-w-0 flex-1">
                <div className="truncate">{milestone.title}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {project
                    ? formatProjectLabel(project.name, project.code)
                    : t`Project`}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 pt-1">
        <span className="text-muted-foreground">{t`Total milestones`}</span>
        <span className="font-semibold">{dayMilestones.length}</span>
      </div>
      {canEdit && (
        <button
          type="button"
          className="flex w-full items-center gap-1.5 rounded-sm border border-dashed border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onCreateMilestone(date)}
        >
          <Plus className="h-3 w-3" />
          {t`Create milestone`}
        </button>
      )}
    </div>
  ), [canEdit, dateLocale, onCreateMilestone, onEditMilestone, projectById]);

  const renderMenuItems = useCallback((dayMilestones: Milestone[], date: string) => (
    <>
      <DropdownMenuLabel>{t`Milestones`}</DropdownMenuLabel>
      {dayMilestones.map((milestone) => {
        const project = projectById.get(milestone.projectId);
        const color = project?.color ?? DEFAULT_NEUTRAL_COLOR;
        const dotColor = hexToRgba(color, 0.8) ?? color;
        return (
          <DropdownMenuItem
            key={milestone.id}
            onSelect={() => onEditMilestone(milestone)}
            className="items-start gap-2"
          >
            <span
              className="mt-1 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
            <span className="min-w-0">
              <span className="block truncate text-[11px] text-muted-foreground">
                {project
                  ? formatProjectLabel(project.name, project.code)
                  : t`Project`}
              </span>
              <span className="block truncate text-sm">
                {milestone.title}
              </span>
            </span>
          </DropdownMenuItem>
        );
      })}
      {canEdit && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onCreateMilestone(date)}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t`Create milestone`}</span>
          </DropdownMenuItem>
        </>
      )}
    </>
  ), [canEdit, onCreateMilestone, onEditMilestone, projectById]);

  const renderContextMenu = useCallback((date: string) => (
    <ContextMenuContent>
      <ContextMenuItem
        disabled={!canEdit}
        onSelect={() => {
          if (!canEdit) return;
          onCreateMilestone(date);
        }}
      >
        {t`Create milestone`}
      </ContextMenuItem>
    </ContextMenuContent>
  ), [canEdit, onCreateMilestone]);

  const hoverContentClass = 'w-60 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs text-foreground shadow-md backdrop-blur';

  return (
    <>
      {/* Calendar header row — children is <TimelineHeader>, milestone cells overlay it */}
      <div className="relative border-b border-border" style={{ width: totalWidth }}>
        {children}
        {milestoneTooltipCells.map((cell) => {
          const triggerStyle = {
            left: cell.dayIndex * dayWidth,
            width: dayWidth,
            top: milestoneHeaderRowTop,
            height: milestoneHeaderRowHeight,
          };
          const hasMultipleMilestones = cell.milestones.length > 1;
          if (hasMultipleMilestones) {
            return (
              <ContextMenu key={`header-milestone-cell-${cell.date}`}>
                <DropdownMenu>
                  <HoverCard openDelay={180} closeDelay={120}>
                    <HoverCardTrigger asChild>
                      <ContextMenuTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            ref={(node) => {
                              if (node) {
                                milestoneHeaderMenuTriggerRefs.current.set(cell.date, node);
                              } else {
                                milestoneHeaderMenuTriggerRefs.current.delete(cell.date);
                              }
                            }}
                            type="button"
                            className="milestone-cell absolute z-10 cursor-pointer bg-transparent"
                            style={triggerStyle}
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onMouseEnter={() => onHover(cell.date, cell.color)}
                            onMouseLeave={onHoverEnd}
                            aria-label={t`Select milestone`}
                          />
                        </DropdownMenuTrigger>
                      </ContextMenuTrigger>
                    </HoverCardTrigger>
                    <HoverCardContent side="bottom" sideOffset={6} className={hoverContentClass}>
                      {renderHoverBody(cell.date, cell.milestones)}
                    </HoverCardContent>
                  </HoverCard>
                  <DropdownMenuContent align="center" className="w-72">
                    {renderMenuItems(cell.milestones, cell.date)}
                  </DropdownMenuContent>
                </DropdownMenu>
                {renderContextMenu(cell.date)}
              </ContextMenu>
            );
          }

          const singleMilestone = cell.milestones[0];
          if (!singleMilestone) return null;

          return (
            <ContextMenu key={`header-milestone-cell-${cell.date}`}>
              <HoverCard openDelay={180} closeDelay={120}>
                <HoverCardTrigger asChild>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      className="milestone-cell absolute z-10 cursor-pointer bg-transparent"
                      style={triggerStyle}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditMilestone(singleMilestone);
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                      onMouseEnter={() => onHover(cell.date, cell.color)}
                      onMouseLeave={onHoverEnd}
                      aria-label={t`Edit milestone`}
                    />
                  </ContextMenuTrigger>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" sideOffset={6} className={hoverContentClass}>
                  {renderHoverBody(cell.date, cell.milestones)}
                </HoverCardContent>
              </HoverCard>
              {renderContextMenu(cell.date)}
            </ContextMenu>
          );
        })}
      </div>

      {/* Milestone row — compact dots on mobile (visual only); chips + interactive cells on desktop */}
      {isMobile ? (
        <div
          className="pointer-events-none relative overflow-hidden border-b border-border bg-timeline-header"
          style={{ width: totalWidth, height: milestoneRowHeight }}
        >
          {milestoneTooltipCells.map((cell) => {
            const dayMilestones = cell.milestones;
            if (dayMilestones.length === 0) return null;
            const visible = dayMilestones.slice(0, MAX_VISIBLE_MOBILE_DOTS);
            const overflow = dayMilestones.length - visible.length;
            const cellLeft = cell.dayIndex * dayWidth;
            return (
              <div
                key={`mobile-milestone-dots-${cell.date}`}
                className="absolute inset-y-0 flex items-center justify-center gap-0.5 px-0.5"
                style={{ left: cellLeft, width: dayWidth }}
              >
                {visible.map((milestone) => {
                  const project = projectById.get(milestone.projectId);
                  const color = project?.color ?? DEFAULT_NEUTRAL_COLOR;
                  return (
                    <span
                      key={milestone.id}
                      aria-hidden="true"
                      className="text-[10px] leading-none"
                      style={{ color }}
                    >
                      ◆
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="text-[9px] font-semibold leading-none text-muted-foreground">
                    +{overflow}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      <div
        className="relative border-b border-border bg-timeline-header"
        style={{ width: totalWidth, height: milestoneRowHeight }}
        onDoubleClick={handleMilestoneRowDoubleClick}
      >
        {milestoneTooltipCells.map((cell) => {
          const triggerStyle = {
            left: cell.dayIndex * dayWidth,
            width: dayWidth,
          };
          const hasMultipleMilestones = cell.milestones.length > 1;
          if (hasMultipleMilestones) {
            return (
              <ContextMenu key={`milestone-cell-${cell.date}`}>
                <DropdownMenu>
                  <HoverCard openDelay={180} closeDelay={120}>
                    <HoverCardTrigger asChild>
                      <ContextMenuTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="milestone-cell absolute inset-y-0 cursor-pointer bg-transparent"
                            style={triggerStyle}
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onMouseEnter={() => onHover(cell.date, cell.color)}
                            onMouseLeave={onHoverEnd}
                            aria-label={t`Select milestone`}
                          />
                        </DropdownMenuTrigger>
                      </ContextMenuTrigger>
                    </HoverCardTrigger>
                    <HoverCardContent side="bottom" sideOffset={6} className={hoverContentClass}>
                      {renderHoverBody(cell.date, cell.milestones)}
                    </HoverCardContent>
                  </HoverCard>
                  <DropdownMenuContent align="center" className="w-72">
                    {renderMenuItems(cell.milestones, cell.date)}
                  </DropdownMenuContent>
                </DropdownMenu>
                {renderContextMenu(cell.date)}
              </ContextMenu>
            );
          }

          const singleMilestone = cell.milestones[0];
          if (!singleMilestone) return null;

          return (
            <ContextMenu key={`milestone-cell-${cell.date}`}>
              <HoverCard openDelay={180} closeDelay={120}>
                <HoverCardTrigger asChild>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      className="milestone-cell absolute inset-y-0 cursor-pointer bg-transparent"
                      style={triggerStyle}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditMilestone(singleMilestone);
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                      onMouseEnter={() => onHover(cell.date, cell.color)}
                      onMouseLeave={onHoverEnd}
                      aria-label={t`Edit milestone`}
                    />
                  </ContextMenuTrigger>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" sideOffset={6} className={hoverContentClass}>
                  {renderHoverBody(cell.date, cell.milestones)}
                </HoverCardContent>
              </HoverCard>
              {renderContextMenu(cell.date)}
            </ContextMenu>
          );
        })}

        {milestoneTooltipCells.map((cell) => {
          const dayMilestones = cell.milestones;
          if (dayMilestones.length === 0) return null;
          const hasMultiple = dayMilestones.length > 1;
          const visibleChips = dayMilestones.slice(0, MAX_VISIBLE_CHIPS);
          const overflowCount = dayMilestones.length - visibleChips.length;
          const cellLeft = cell.dayIndex * dayWidth;

          const chips = visibleChips.map((milestone) => {
            const project = projectById.get(milestone.projectId);
            const color = project?.color ?? DEFAULT_NEUTRAL_COLOR;
            const bg = hexToRgba(color, 0.18) ?? color;
            const border = hexToRgba(color, 0.55) ?? color;
            const chipButton = (
              <button
                type="button"
                title={milestone.title}
                className="milestone-chip pointer-events-auto flex w-full min-w-0 select-none items-center gap-1 rounded-sm border px-1 text-left text-[10px] font-medium leading-none text-foreground transition-colors hover:brightness-105 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                style={{
                  backgroundColor: bg,
                  borderColor: border,
                  height: 16,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!hasMultiple) onEditMilestone(milestone);
                }}
                onMouseEnter={() => onHover(milestone.date, color)}
                onMouseLeave={onHoverEnd}
              >
                <span
                  aria-hidden="true"
                  className="shrink-0 text-[10px] leading-none"
                  style={{ color }}
                >
                  ◆
                </span>
                <span className="min-w-0 flex-1 truncate">{milestone.title}</span>
              </button>
            );

            if (hasMultiple) {
              // All chips trigger the same cell-level dropdown with every milestone.
              return (
                <DropdownMenuTrigger asChild key={milestone.id}>
                  {chipButton}
                </DropdownMenuTrigger>
              );
            }
            return (
              <ContextMenu key={milestone.id}>
                <ContextMenuTrigger asChild>{chipButton}</ContextMenuTrigger>
                {renderContextMenu(milestone.date)}
              </ContextMenu>
            );
          });

          const overflowButton = overflowCount > 0 && (
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t`Show ${overflowCount} more milestones`}
                className="milestone-chip pointer-events-auto flex w-full select-none items-center justify-center rounded-sm border border-border bg-muted px-1 text-[10px] font-semibold leading-none text-muted-foreground hover:bg-muted/80 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
                style={{ height: 14 }}
                onClick={(event) => event.stopPropagation()}
                onMouseEnter={() => onHover(cell.date, cell.color)}
                onMouseLeave={onHoverEnd}
              >
                +{overflowCount}
              </button>
            </DropdownMenuTrigger>
          );

          const chipsContainer = (
            <div
              className="pointer-events-none absolute inset-y-0 flex flex-col items-stretch justify-start gap-0.5 px-1 py-0.5"
              style={{ left: cellLeft, width: dayWidth }}
            >
              {chips}
              {overflowButton}
            </div>
          );

          if (hasMultiple) {
            return (
              <DropdownMenu key={`milestone-chips-${cell.date}`}>
                {chipsContainer}
                <DropdownMenuContent align="center" className="w-72">
                  {renderMenuItems(dayMilestones, cell.date)}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }

          return <React.Fragment key={`milestone-chips-${cell.date}`}>{chipsContainer}</React.Fragment>;
        })}
      </div>
      )}
    </>
  );
};

// Re-created on every scroll tick by TimelineGrid. Effective only because the
// parent passes a memoized `children` element (the TimelineHeader) and stable
// callbacks — otherwise `children` would differ every render and defeat the memo.
export const MilestoneLayer = React.memo(MilestoneLayerBase);
MilestoneLayer.displayName = 'MilestoneLayer';
