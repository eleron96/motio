import React, { useMemo } from 'react';
import { t } from '@lingui/macro';
import { MoreHorizontal, SlidersHorizontal, Star } from 'lucide-react';
import type { Customer, Milestone, Project } from '@/features/planner/types/planner';
import { countUpcomingMilestones } from '@/features/projects/lib/projectCard/countUpcomingMilestones';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { SearchInput } from '@/shared/ui/SearchInput';
import { MobileListGroup, MobileListRow } from '@/shared/ui/mobile-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

interface ProjectsMobileListProps {
  projects: Project[];
  customerById: Map<string, Customer>;
  milestones: Milestone[];
  trackedProjectIdSet: Set<string>;
  canEdit: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  /** Number of filters in effect, shown on the filters button. */
  activeFilterCount: number;
  onOpenFilters: () => void;
  onOpenProject: (project: Project) => void;
  onToggleTracked: (projectId: string, nextTracked: boolean) => void;
  onOpenSettings: (project: Project) => void;
  onToggleArchived: (project: Project) => void;
  onRequestDelete: (project: Project) => void;
  showArchived: boolean;
}

/**
 * Projects on a phone: the list is the page, and a row is a project you tap.
 *
 * The desktop sidebar carries its filters as four popovers and its per-project
 * actions as a menu inside a dense row — neither survives a thumb, so here the
 * filters live on their own screen and the row keeps a single menu beside it.
 */
export const ProjectsMobileList: React.FC<ProjectsMobileListProps> = ({
  projects,
  customerById,
  milestones,
  trackedProjectIdSet,
  canEdit,
  search,
  onSearchChange,
  activeFilterCount,
  onOpenFilters,
  onOpenProject,
  onToggleTracked,
  onOpenSettings,
  onToggleArchived,
  onRequestDelete,
  showArchived,
}) => {
  const milestoneCountByProject = useMemo(
    () => countUpcomingMilestones(milestones, new Date()),
    [milestones],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2.5 border-b border-border bg-card px-3.5 py-2.5">
        <SearchInput
          value={search}
          onValueChange={onSearchChange}
          placeholder={t`Search projects...`}
          className="w-full"
          inputClassName="h-11 rounded-xl text-sm"
          clearLabel={t`Clear search`}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-between"
          onClick={onOpenFilters}
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            {t`Filters`}
          </span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="tabular-nums">{activeFilterCount}</Badge>
          )}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3.5 py-3">
        {projects.length === 0 ? (
          <p className="px-1.5 py-6 text-sm text-muted-foreground">
            {showArchived ? t`No archived projects.` : t`No projects yet.`}
          </p>
        ) : (
          <MobileListGroup>
            {projects.map((project) => {
              const customer = project.customerId ? customerById.get(project.customerId) : null;
              const milestoneCount = milestoneCountByProject.get(project.id) ?? 0;
              const isTracked = trackedProjectIdSet.has(project.id);
              const subtitleParts = [
                customer?.name ?? t`No customer`,
                milestoneCount > 0 ? t`${milestoneCount} milestones ahead` : null,
              ].filter(Boolean);

              return (
                <div key={project.id} className="relative">
                  <MobileListRow
                    leading={(
                      <span
                        aria-hidden="true"
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                    )}
                    title={formatProjectLabel(project.name, project.code)}
                    subtitle={subtitleParts.join(' · ')}
                    value={isTracked ? (
                      <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-label={t`Tracked`} />
                    ) : undefined}
                    chevron
                    onClick={() => onOpenProject(project)}
                    className="pr-20"
                  />

                  {/* Beside the row, never inside it: a row is a button, and a
                      button within a button steals the tap. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={t`Project actions`}
                        data-testid={`project-actions-${project.id}`}
                        className="absolute right-1.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/60"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onToggleTracked(project.id, !isTracked)}>
                        {isTracked ? t`Stop tracking` : t`Track project`}
                      </DropdownMenuItem>
                      {canEdit && (
                        <>
                          <DropdownMenuItem onSelect={() => onOpenSettings(project)}>
                            {t`Project settings`}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => onToggleArchived(project)}>
                            {project.archived ? t`Unarchive` : t`Archive`}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => onRequestDelete(project)}
                            className="text-destructive focus:text-destructive"
                          >
                            {t`Delete`}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </MobileListGroup>
        )}
      </div>
    </div>
  );
};
