import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '@lingui/macro';
import { format, parseISO } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
import type { Customer, Milestone, Project } from '@/features/planner/types/planner';
import {
  deriveMilestonesWithStatus,
  type MilestoneStatus,
  type MilestoneWithStatus,
} from '@/features/projects/lib/projectCard/deriveMilestoneStatus';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { SearchInput } from '@/shared/ui/SearchInput';
import { MobileScreenShell } from '@/shared/ui/mobile-screen-shell';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/lib/classNames';

interface MilestonesMobileSectionProps {
  /** Every milestone that passes the search and group filters — past included. */
  milestones: Milestone[];
  projectById: Map<string, Project>;
  customerById: Map<string, Customer>;
  search: string;
  onSearchChange: (value: string) => void;
  canEdit: boolean;
  onOpenProject: (milestone: Milestone) => void;
  onEditMilestone: (milestone: Milestone) => void;
  onRequestDelete: (milestone: Milestone) => void;
}

const STATUS_DOT: Record<MilestoneStatus, string> = {
  done: 'bg-muted-foreground/40',
  current: 'bg-amber-500',
  upcoming: 'bg-primary/60',
};

/**
 * Milestones on a phone: one scrolling timeline, opened at the nearest one.
 *
 * There is no "current / past" switch — scrolling up *is* going back in time,
 * which is the same gesture people already use for history everywhere else.
 * A row says when and what; everything you can do with a milestone lives on
 * its own screen, so the list stays readable.
 */
export const MilestonesMobileSection: React.FC<MilestonesMobileSectionProps> = ({
  milestones,
  projectById,
  customerById,
  search,
  onSearchChange,
  canEdit,
  onOpenProject,
  onEditMilestone,
  onRequestDelete,
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const nearestRef = useRef<HTMLDivElement | null>(null);
  const scrolledForRef = useRef<string | null>(null);
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null);

  const withStatus = useMemo(
    () => deriveMilestonesWithStatus(milestones, new Date()),
    [milestones],
  );

  // Where the list opens: the first milestone still ahead, or the last one
  // behind when everything has passed.
  const nearestId = useMemo(() => {
    if (withStatus.length === 0) return null;
    const ahead = withStatus.find((milestone) => milestone.status !== 'done');
    return (ahead ?? withStatus[withStatus.length - 1]).id;
  }, [withStatus]);

  // Once per set of milestones, not on every render: re-centring while the user
  // scrolls would fight them.
  //
  // Measured against the scroller itself rather than through `offsetTop`: that
  // is relative to the nearest positioned ancestor, which here is neither the
  // scroller nor anything predictable, so it silently added the header and the
  // section strip to the distance and landed weeks off.
  useLayoutEffect(() => {
    if (!nearestId || scrolledForRef.current === nearestId) return;
    const scroller = scrollerRef.current;
    const row = nearestRef.current;
    if (!scroller || !row) return;
    scrolledForRef.current = nearestId;
    const offset = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop = Math.max(0, scroller.scrollTop + offset - scroller.clientHeight / 3);
  }, [nearestId, withStatus.length]);

  const openMilestone = withStatus.find((milestone) => milestone.id === openMilestoneId) ?? null;
  const openProject = openMilestone ? projectById.get(openMilestone.projectId) ?? null : null;
  const openCustomer = openProject?.customerId
    ? customerById.get(openProject.customerId) ?? null
    : null;

  const statusLabel = (status: MilestoneStatus) => {
    if (status === 'done') return t`Done`;
    if (status === 'current') return t`Current`;
    return t`Upcoming`;
  };

  // Month headings turn a long timeline into something you can skim while
  // scrolling back through it.
  const sections = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: MilestoneWithStatus[] }> = [];
    withStatus.forEach((milestone) => {
      const date = parseISO(milestone.date);
      const key = format(date, 'yyyy-MM');
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(milestone);
        return;
      }
      groups.push({ key, label: format(date, 'LLLL yyyy'), items: [milestone] });
    });
    return groups;
  }, [withStatus]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border bg-card px-3.5 py-2.5">
        <SearchInput
          value={search}
          onValueChange={onSearchChange}
          placeholder={t`Search milestones...`}
          className="w-full"
          inputClassName="h-11 rounded-xl text-sm"
          clearLabel={t`Clear search`}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </div>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3.5 pt-3 pb-24"
      >
        {withStatus.length === 0 ? (
          <p className="px-1.5 py-6 text-sm text-muted-foreground">{t`No milestones yet.`}</p>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => (
              <MobileListGroup key={section.key} title={section.label}>
                {section.items.map((milestone) => {
                  const project = projectById.get(milestone.projectId);
                  return (
                    <div
                      key={milestone.id}
                      ref={milestone.id === nearestId ? nearestRef : undefined}
                    >
                      <MobileListRow
                        leading={(
                          <span
                            aria-hidden="true"
                            className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[milestone.status])}
                          />
                        )}
                        title={milestone.title}
                        subtitle={project
                          ? formatProjectLabel(project.name, project.code)
                          : undefined}
                        value={format(parseISO(milestone.date), 'dd MMM')}
                        chevron
                        onClick={() => setOpenMilestoneId(milestone.id)}
                      />
                    </div>
                  );
                })}
              </MobileListGroup>
            ))}
          </div>
        )}
      </div>

      <MobileScreenShell
        open={openMilestone !== null}
        onOpenChange={(next) => {
          if (!next) setOpenMilestoneId(null);
        }}
        title={openMilestone?.title ?? t`Milestone`}
        action={canEdit && openMilestone ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t`Milestone actions`}
                data-testid="milestone-actions"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/60"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[70]">
              <DropdownMenuItem onSelect={() => onEditMilestone(openMilestone)}>
                {t`Edit milestone`}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setOpenMilestoneId(null);
                  onRequestDelete(openMilestone);
                }}
                className="text-destructive focus:text-destructive"
              >
                {t`Delete`}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined}
      >
        {!openMilestone ? null : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card px-4 py-4">
              <div className="text-sm text-muted-foreground tabular-nums">
                {format(parseISO(openMilestone.date), 'dd MMMM yyyy')}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">
                  {statusLabel(openMilestone.status)}
                </Badge>
                {openProject && (
                  <Badge variant="outline" className="text-[10px]">
                    {formatProjectLabel(openProject.name, openProject.code)}
                  </Badge>
                )}
                {openCustomer && (
                  <Badge variant="outline" className="text-[10px]">{openCustomer.name}</Badge>
                )}
              </div>
              {openMilestone.note && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                  {openMilestone.note}
                </p>
              )}
            </div>

            {openProject && (
              <Button
                variant="outline"
                className="h-12 w-full"
                onClick={() => {
                  setOpenMilestoneId(null);
                  onOpenProject(openMilestone);
                }}
              >
                {t`Open project`}
              </Button>
            )}
          </div>
        )}
      </MobileScreenShell>
    </div>
  );
};
