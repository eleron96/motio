import React from 'react';
import { t } from '@lingui/macro';
import { Archive, ArrowDownAZ, ArrowUpAZ, Filter, Layers, MoreHorizontal, Search, Users } from 'lucide-react';
import type { Customer, MemberGroup, Milestone, Project } from '@/features/planner/types/planner';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { getMonogramColor } from '@/shared/lib/monogramColor';
import { buildProjectAccentVars } from '@/features/projects/lib/projectCard/projectAccent';
import styles from './projectCard.module.css';

export interface ProjectCardSidebarGroup {
  id: string;
  name: string;
  projects: Project[];
}

interface ProjectCardSidebarProps {
  projects: Project[];
  customerById: Map<string, Customer>;
  memberGroupById: Map<string, MemberGroup>;
  /** All milestones in the workspace; used to compute per-project counts. */
  milestones: Milestone[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  nameSort: 'asc' | 'desc';
  onToggleNameSort: () => void;
  canEdit: boolean;
  onOpenProjectSettings: (project: Project) => void;
  onToggleProjectArchived: (project: Project) => void;
  onRequestDeleteProject: (project: Project) => void;
  /** Phase 2 — workspace-level "active" tab label so the user knows what list they're looking at. */
  groupLabel?: string;
  /** Phase 1.5 follow-up: customer filter (popover with checkboxes) + group-by-customer toggle. */
  sortedCustomers: Customer[];
  customerFilterIds: string[];
  customerFilterLabel: string;
  onToggleCustomerFilter: (customerId: string) => void;
  onClearCustomerFilters: () => void;
  groupByCustomer: boolean;
  onToggleGroupByCustomer: () => void;
  /** Phase 7: filter by owner team (member group). */
  memberGroups: MemberGroup[];
  ownerGroupFilterIds: string[];
  ownerGroupFilterLabel: string;
  onToggleOwnerGroupFilter: (groupId: string) => void;
  onClearOwnerGroupFilters: () => void;
  /** Phase 7.5: optional Projects | Customers tabs rendered above the title. */
  modeTabs?: React.ReactNode;
  /** Phase 7.6: active/archived toggle controlled from the page state. */
  showArchived: boolean;
  onToggleShowArchived: () => void;
  /**
   * Pre-grouped projects when `groupByCustomer` is on. The page already builds
   * this through `groupProjectsForSidebar` for the legacy sidebar, so we
   * accept it as a prop instead of re-implementing the grouping rules here.
   */
  groupedProjects: ProjectCardSidebarGroup[];
}

export const ProjectCardSidebar: React.FC<ProjectCardSidebarProps> = ({
  projects,
  customerById,
  memberGroupById,
  milestones,
  selectedProjectId,
  onSelectProject,
  search,
  onSearchChange,
  nameSort,
  onToggleNameSort,
  canEdit,
  onOpenProjectSettings,
  onToggleProjectArchived,
  onRequestDeleteProject,
  groupLabel,
  sortedCustomers,
  customerFilterIds,
  customerFilterLabel,
  onToggleCustomerFilter,
  onClearCustomerFilters,
  groupByCustomer,
  onToggleGroupByCustomer,
  groupedProjects,
  memberGroups,
  ownerGroupFilterIds,
  ownerGroupFilterLabel,
  onToggleOwnerGroupFilter,
  onClearOwnerGroupFilters,
  modeTabs,
  showArchived,
  onToggleShowArchived,
}) => {
  const milestoneCountByProject = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const milestone of milestones) {
      map.set(milestone.projectId, (map.get(milestone.projectId) ?? 0) + 1);
    }
    return map;
  }, [milestones]);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-card">
      {modeTabs}
      <div className="flex items-baseline justify-between px-5 pb-2 pt-5">
        <h2 className="text-ui-lg font-semibold">{t`Projects`}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
          {projects.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-3">
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <input
            className="flex-1 bg-transparent text-ui-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            placeholder={t`Search projects...`}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted hover:text-foreground ${
                  customerFilterIds.length > 0
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground'
                }`}
                aria-label={t`Filter by customer`}
                title={t`Filter by customer`}
              >
                <Filter className="h-3.5 w-3.5" />
                {customerFilterLabel}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-3" align="start">
              <div className="flex items-center justify-between pb-2">
                <span className="text-[11px] text-muted-foreground">{t`Filter customers`}</span>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={onClearCustomerFilters}
                >
                  {t`Clear`}
                </button>
              </div>
              <ScrollArea className="max-h-56 pr-2">
                <div className="space-y-1">
                  <label className="flex cursor-pointer items-center gap-2 py-1">
                    <Checkbox
                      checked={customerFilterIds.includes('none')}
                      onCheckedChange={() => onToggleCustomerFilter('none')}
                    />
                    <span className="text-sm">{t`No customer`}</span>
                  </label>
                  {sortedCustomers.length === 0 && (
                    <div className="text-xs text-muted-foreground">{t`No customers yet.`}</div>
                  )}
                  {sortedCustomers.map((customer) => (
                    <label key={customer.id} className="flex cursor-pointer items-center gap-2 py-1">
                      <Checkbox
                        checked={customerFilterIds.includes(customer.id)}
                        onCheckedChange={() => onToggleCustomerFilter(customer.id)}
                      />
                      <span className="truncate text-sm">{customer.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium hover:bg-muted hover:text-foreground ${
                  ownerGroupFilterIds.length > 0
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground'
                }`}
                aria-label={t`Filter by owner team`}
                title={ownerGroupFilterIds.length > 0 ? ownerGroupFilterLabel : t`Filter by team`}
              >
                <Users className="h-3.5 w-3.5" />
                {ownerGroupFilterIds.length > 0 && (
                  <span className="text-[10px] tabular-nums">{ownerGroupFilterIds.length}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-3" align="start">
              <div className="flex items-center justify-between pb-2">
                <span className="text-[11px] text-muted-foreground">{t`Filter by team`}</span>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={onClearOwnerGroupFilters}
                >
                  {t`Clear`}
                </button>
              </div>
              <ScrollArea className="max-h-56 pr-2">
                <div className="space-y-1">
                  <label className="flex cursor-pointer items-center gap-2 py-1">
                    <Checkbox
                      checked={ownerGroupFilterIds.includes('none')}
                      onCheckedChange={() => onToggleOwnerGroupFilter('none')}
                    />
                    <span className="text-sm">{t`No team`}</span>
                  </label>
                  {memberGroups.length === 0 && (
                    <div className="text-xs text-muted-foreground">{t`No teams yet.`}</div>
                  )}
                  {memberGroups.map((group) => (
                    <label key={group.id} className="flex cursor-pointer items-center gap-2 py-1">
                      <Checkbox
                        checked={ownerGroupFilterIds.includes(group.id)}
                        onCheckedChange={() => onToggleOwnerGroupFilter(group.id)}
                      />
                      <span className="truncate text-sm">{group.name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onToggleNameSort}
            title={nameSort === 'asc' ? t`Sort A to Z` : t`Sort Z to A`}
          >
            {nameSort === 'asc' ? (
              <ArrowDownAZ className="h-3.5 w-3.5" />
            ) : (
              <ArrowUpAZ className="h-3.5 w-3.5" />
            )}
            {nameSort === 'asc' ? t`A-Z` : t`Z-A`}
          </button>
          <button
            type="button"
            onClick={onToggleShowArchived}
            aria-pressed={showArchived}
            title={showArchived ? t`Showing archived` : t`Show archived`}
            className={`ml-auto grid h-7 w-7 place-items-center rounded-md hover:bg-muted hover:text-foreground ${
              showArchived ? 'bg-muted text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleGroupByCustomer}
            aria-pressed={groupByCustomer}
            title={t`Group by customer`}
            className={`grid h-7 w-7 place-items-center rounded-md hover:bg-muted hover:text-foreground ${
              groupByCustomer ? 'bg-muted text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="px-5 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
        {groupLabel ?? t`Active`}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
        {projects.length === 0 && (
          <div className="px-2 py-6 text-center text-ui-xs text-muted-foreground">
            {t`No projects match the current search.`}
          </div>
        )}
        {groupByCustomer ? (
          <div className="space-y-3">
            {groupedProjects.map((group) => (
              <div key={group.id} className="space-y-1">
                <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
                  {group.name}
                </div>
                <ul className="space-y-1">
                  {group.projects.map((project) => renderProjectItem(project))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="space-y-1">
            {projects.map((project) => renderProjectItem(project))}
          </ul>
        )}
      </div>
    </aside>
  );

  function renderProjectItem(project: Project) {
    const isActive = selectedProjectId === project.id;
    const customer = customerById.get(project.customerId ?? '') ?? null;
    const ownerGroup = project.ownerGroupId
      ? memberGroupById.get(project.ownerGroupId) ?? null
      : null;
    const ownerColor = ownerGroup ? getMonogramColor(ownerGroup.id) : null;
    const milestoneCount = milestoneCountByProject.get(project.id) ?? 0;

    return (
      <li key={project.id}>
        <div
          className={`group relative overflow-hidden rounded-lg border ${
            isActive
              ? 'border-[var(--project-accent)] bg-[var(--project-accent-soft)]'
              : 'border-transparent hover:bg-muted/50'
          }`}
          style={buildProjectAccentVars(project.color)}
        >
          <button
            type="button"
            onClick={() => onSelectProject(project.id)}
            className="flex w-full items-stretch gap-2.5 text-left"
          >
            <div className={`my-2.5 ${styles.sidebarBar}`} />
            <div className="min-w-0 flex-1 py-2.5 pr-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {project.code && (
                  <span className="font-semibold text-foreground tabular-nums">
                    [{project.code}]
                  </span>
                )}
                <span className="truncate">
                  {customer?.name ?? t`No customer`}
                </span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-ui-sm font-medium leading-snug">
                {project.name}
              </div>
              {project.status && (
                <div className="mt-1 inline-flex items-center rounded-sm bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {project.status}
                </div>
              )}
              {ownerGroup && (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ background: ownerColor ?? undefined }}
                  />
                  <span className="truncate">{ownerGroup.name}</span>
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="tabular-nums">
                  {milestoneCount === 1
                    ? t`${milestoneCount} milestone`
                    : t`${milestoneCount} milestones`}
                </span>
              </div>
            </div>
          </button>
          {canEdit && (
            <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
                    aria-label={t`Project actions`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => onOpenProjectSettings(project)}>
                    {t`Edit project`}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onToggleProjectArchived(project)}>
                    {project.archived ? t`Unarchive` : t`Archive`}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => onRequestDeleteProject(project)}
                    className="text-destructive focus:text-destructive"
                  >
                    {t`Delete...`}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </li>
    );
  }
};
