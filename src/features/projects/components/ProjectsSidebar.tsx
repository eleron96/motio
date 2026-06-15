import React from 'react';
import { t } from '@lingui/macro';
import { ArrowDownAZ, ArrowDownZA, CalendarDays, ChevronDown, Filter, Layers, MoreHorizontal, Search, Star, Users } from 'lucide-react';
import { cn } from '@/shared/lib/classNames';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/shared/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { SearchInput } from '@/shared/ui/SearchInput';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { SegmentedControl, SegmentedControlItem } from '@/shared/ui/segmented-control';
import { SelectableListItem } from '@/shared/ui/selectable-list-item';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Customer, MemberGroup, Milestone, Project } from '@/features/planner/types/planner';

type Mode = 'projects' | 'milestones' | 'customers';
type ProjectTab = 'active' | 'archived';
type MilestoneTab = 'active' | 'past';

type MilestoneGroup = {
  id: string;
  name: string;
  milestones: Milestone[];
};

type ProjectGroup = {
  id: string;
  name: string;
  projects: Project[];
};

type ProjectsSidebarProps = {
  mode: Mode;
  onModeChange: (nextMode: Mode) => void;
  canEdit: boolean;
  nameSort: 'asc' | 'desc';
  nameSortLabel: string;
  onToggleNameSort: () => void;
  customerSearch: string;
  onCustomerSearchChange: (value: string) => void;
  sortedCustomers: Customer[];
  filteredCustomers: Customer[];
  customerProjectCounts: Map<string, number>;
  selectedCustomerId: string | null;
  onSelectCustomer: (customerId: string) => void;
  onStartCustomerEdit: (customerId: string, customerName: string, industry?: string | null) => void;
  onRequestDeleteCustomer: (customer: Customer) => void;
  milestoneTab: MilestoneTab;
  onMilestoneTabChange: (value: MilestoneTab) => void;
  milestoneSearch: string;
  onMilestoneSearchChange: (value: string) => void;
  milestoneGroupLabel: string;
  onCycleMilestoneGroup: () => void;
  /** Filter milestones by the owner team (member group) of their parent
   * project. Mirrors the popover used in ProjectCardSidebar so the UX is
   * consistent between modes. */
  memberGroups: MemberGroup[];
  milestoneOwnerGroupFilterIds: string[];
  onToggleMilestoneOwnerGroupFilter: (groupId: string) => void;
  onClearMilestoneOwnerGroupFilters: () => void;
  milestones: Milestone[];
  visibleMilestones: Milestone[];
  groupedMilestones: MilestoneGroup[];
  selectedMilestoneId: string | null;
  onSelectMilestone: (milestoneId: string) => void;
  onOpenMilestoneSettings: (milestone: Milestone) => void;
  onOpenProjectFromMilestone: (milestone: Milestone) => void;
  onRequestDeleteMilestone: (milestone: Milestone) => void;
  projectById: Map<string, Project>;
  customerById: Map<string, Customer>;
  trackedProjectIdSet: Set<string>;
  formatMilestoneDate: (date: string) => string;
  tab: ProjectTab;
  onTabChange: (value: ProjectTab) => void;
  projectSearch: string;
  onProjectSearchChange: (value: string) => void;
  customerFilterLabel: string;
  customerFilterIds: string[];
  onClearCustomerFilters: () => void;
  onToggleCustomerFilter: (customerId: string) => void;
  groupByCustomer: boolean;
  onToggleGroupByCustomer: () => void;
  activeProjects: Project[];
  archivedProjects: Project[];
  filteredActiveProjects: Project[];
  filteredArchivedProjects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onToggleTrackedProject: (projectId: string, nextTracked: boolean) => void;
  onOpenProjectSettings: (project: Project) => void;
  onRequestDeleteProject: (project: Project) => void;
  onToggleProjectArchived: (project: Project) => Promise<void>;
  groupProjects: (list: Project[]) => ProjectGroup[];
  hideModeSelector?: boolean;
};

export const ProjectsSidebar = ({
  mode,
  onModeChange,
  canEdit,
  nameSort,
  nameSortLabel,
  onToggleNameSort,
  customerSearch,
  onCustomerSearchChange,
  sortedCustomers,
  filteredCustomers,
  customerProjectCounts,
  selectedCustomerId,
  onSelectCustomer,
  onStartCustomerEdit,
  onRequestDeleteCustomer,
  milestoneTab,
  onMilestoneTabChange,
  milestoneSearch,
  onMilestoneSearchChange,
  milestoneGroupLabel,
  onCycleMilestoneGroup,
  memberGroups,
  milestoneOwnerGroupFilterIds,
  onToggleMilestoneOwnerGroupFilter,
  onClearMilestoneOwnerGroupFilters,
  milestones,
  visibleMilestones,
  groupedMilestones,
  selectedMilestoneId,
  onSelectMilestone,
  onOpenMilestoneSettings,
  onOpenProjectFromMilestone,
  onRequestDeleteMilestone,
  projectById,
  customerById,
  trackedProjectIdSet,
  formatMilestoneDate,
  tab,
  onTabChange,
  projectSearch,
  onProjectSearchChange,
  customerFilterLabel,
  customerFilterIds,
  onClearCustomerFilters,
  onToggleCustomerFilter,
  groupByCustomer,
  onToggleGroupByCustomer,
  activeProjects,
  archivedProjects,
  filteredActiveProjects,
  filteredArchivedProjects,
  selectedProjectId,
  onSelectProject,
  onToggleTrackedProject,
  onOpenProjectSettings,
  onRequestDeleteProject,
  onToggleProjectArchived,
  groupProjects,
  hideModeSelector = false,
}: ProjectsSidebarProps) => {
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  const compactFilters = hideModeSelector;
  const hasActiveProjectFilters = projectSearch.trim().length > 0
    || customerFilterIds.length > 0
    || groupByCustomer
    || nameSort !== 'asc';
  const renderProjectItem = (project: Project, showArchivedBadge: boolean) => {
    const customerName = project.customerId ? customerById.get(project.customerId)?.name : null;
    const isTracked = trackedProjectIdSet.has(project.id);
    return (
      <ContextMenu key={project.id}>
        <ContextMenuTrigger asChild>
          <SelectableListItem
            selected={selectedProjectId === project.id}
            onClick={() => onSelectProject(project.id)}
            onDoubleClick={() => {
              if (!canEdit) return;
              onOpenProjectSettings(project);
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {formatProjectLabel(project.name, project.code)}
                </div>
                <div className="text-xs text-muted-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {customerName ?? t`No customer`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isTracked && (
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                )}
                {showArchivedBadge && (
                  <Badge variant="secondary" size="xs">{t`Archived`}</Badge>
                )}
              </div>
            </div>
          </SelectableListItem>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onToggleTrackedProject(project.id, !isTracked)}>
            {isTracked ? t`Stop tracking` : t`Track`}
          </ContextMenuItem>
          <ContextMenuItem disabled={!canEdit} onSelect={() => onOpenProjectSettings(project)}>
            {t`Edit`}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={() => void onToggleProjectArchived(project)}
          >
            {project.archived ? t`Restore` : t`Archive`}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={() => onRequestDeleteProject(project)}
            className="text-destructive focus:text-destructive"
          >
            {t`Delete`}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderProjectGroups = (list: Project[], showArchivedBadge: boolean) => {
    if (list.length === 0) {
      return (
        <div className="text-sm text-muted-foreground">
          {t`No projects match the current filters.`}
        </div>
      );
    }

    if (!groupByCustomer) {
      return (
        <div className="space-y-2">
          {list.map((project) => renderProjectItem(project, showArchivedBadge))}
        </div>
      );
    }

    const groups = groupProjects(list);
    return (
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {group.name}
            </div>
            <div className="space-y-2">
              {group.projects.map((project) => renderProjectItem(project, showArchivedBadge))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderMilestoneItem = (milestone: Milestone) => {
    const project = projectById.get(milestone.projectId);
    const customer = project?.customerId ? customerById.get(project.customerId) : null;
    const projectLabel = project
      ? formatProjectLabel(project.name, project.code)
      : t`Unknown project`;
    const isTracked = trackedProjectIdSet.has(milestone.projectId);

    return (
      <ContextMenu key={milestone.id}>
        <ContextMenuTrigger asChild>
          <SelectableListItem
            selected={selectedMilestoneId === milestone.id}
            onClick={() => onSelectMilestone(milestone.id)}
            onDoubleClick={() => {
              if (!canEdit) return;
              onOpenMilestoneSettings(milestone);
            }}
          >
            <div className="flex items-start gap-2 min-w-0">
              <CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {milestone.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatMilestoneDate(milestone.date)}
                </div>
                <div className="text-xs text-muted-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {projectLabel}
                </div>
                <div className="text-[11px] text-muted-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                  {customer?.name ?? t`No customer`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isTracked && (
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                )}
                {project?.archived && (
                  <Badge variant="secondary" size="xs">{t`Archived`}</Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
                      aria-label={t`Milestone actions`}
                      // Stop the click from selecting the row underneath —
                      // the user is reaching for the kebab, not the item.
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem disabled={!canEdit} onSelect={() => onOpenMilestoneSettings(milestone)}>
                      {t`Edit`}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!project}
                      onSelect={() => onOpenProjectFromMilestone(milestone)}
                    >
                      {t`Open project`}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!canEdit}
                      onSelect={() => onRequestDeleteMilestone(milestone)}
                      className="text-destructive focus:text-destructive"
                    >
                      {t`Delete`}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </SelectableListItem>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled={!canEdit} onSelect={() => onOpenMilestoneSettings(milestone)}>
            {t`Edit`}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!project}
            onSelect={() => onOpenProjectFromMilestone(milestone)}
          >
            {t`Open project`}
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={() => onRequestDeleteMilestone(milestone)}
            className="text-destructive focus:text-destructive"
          >
            {t`Delete`}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderMilestoneGroups = () => {
    if (groupedMilestones.length === 0) {
      return (
        <div className="text-sm text-muted-foreground">
          {t`No milestones match the current filters.`}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {groupedMilestones.map((group) => (
          <div key={group.id} className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {group.name}
            </div>
            <div className="space-y-2">
              {group.milestones.map((milestone) => renderMilestoneItem(milestone))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <aside data-tour="projects-sidebar" className="h-full min-h-0 min-w-0 bg-card flex flex-col">
      {hideModeSelector ? null : (
        <div className="px-4 py-3 border-b border-border">
          <SegmentedControl surface="filled">
            <SegmentedControlItem
              active={mode === 'projects'}
              onClick={() => onModeChange('projects')}
            >
              {t`Projects`}
            </SegmentedControlItem>
            <SegmentedControlItem
              active={mode === 'milestones'}
              onClick={() => onModeChange('milestones')}
            >
              {t`Milestones`}
            </SegmentedControlItem>
            <SegmentedControlItem
              active={mode === 'customers'}
              onClick={() => onModeChange('customers')}
            >
              {t`Customers`}
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      )}

      {mode === 'customers' && (
        <>
          <div className="px-4 py-3 border-b border-border">
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <SearchInput
                inputClassName="h-8"
                placeholder={t`Search customers...`}
                value={customerSearch}
                onValueChange={onCustomerSearchChange}
                clearLabel={t`Clear search`}
              />
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2"
                  onClick={onToggleNameSort}
                >
                  {nameSort === 'asc' ? (
                    <ArrowDownAZ className="h-4 w-4" />
                  ) : (
                    <ArrowDownZA className="h-4 w-4" />
                  )}
                  <span className="text-xs text-muted-foreground">{nameSortLabel}</span>
                </Button>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3">
            {sortedCustomers.length === 0 && (
              <div className="text-sm text-muted-foreground">{t`No customers yet.`}</div>
            )}
            {sortedCustomers.length > 0 && filteredCustomers.length === 0 && (
              <div className="text-sm text-muted-foreground">{t`No customers found.`}</div>
            )}
            {filteredCustomers.length > 0 && (
              <div className="space-y-2">
                {filteredCustomers.map((customer) => {
                  const projectCount = customerProjectCounts.get(customer.id) ?? 0;
                  const isSelected = selectedCustomerId === customer.id;
                  return (
                    <ContextMenu key={customer.id}>
                      <ContextMenuTrigger asChild>
                        <SelectableListItem
                          selected={isSelected}
                          className="flex items-center gap-3"
                          onClick={() => onSelectCustomer(customer.id)}
                          onContextMenu={() => onSelectCustomer(customer.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                              {customer.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t`${projectCount} projects`}
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
                                aria-label={t`Customer actions`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                disabled={!canEdit}
                                onSelect={() => onStartCustomerEdit(customer.id, customer.name, customer.industry)}
                              >
                                {t`Edit`}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={!canEdit}
                                onSelect={() => onRequestDeleteCustomer(customer)}
                                className="text-destructive focus:text-destructive"
                              >
                                {t`Delete`}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SelectableListItem>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          disabled={!canEdit}
                          onSelect={() => onStartCustomerEdit(customer.id, customer.name, customer.industry)}
                        >
                          {t`Edit`}
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={!canEdit}
                          onSelect={() => onRequestDeleteCustomer(customer)}
                          className="text-destructive focus:text-destructive"
                        >
                          {t`Delete`}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {mode === 'milestones' && (
        <Tabs
          value={milestoneTab}
          onValueChange={(value) => onMilestoneTabChange(value as MilestoneTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-4 py-3 border-b border-border">
            <div className="flex flex-col gap-2">
              <SearchInput
                inputClassName="h-8"
                placeholder={t`Search milestones...`}
                value={milestoneSearch}
                onValueChange={onMilestoneSearchChange}
                clearLabel={t`Clear search`}
              />
              <div className="flex items-center gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        'h-8 gap-1.5 px-2',
                        milestoneOwnerGroupFilterIds.length > 0 && 'bg-muted text-foreground',
                      )}
                      aria-label={t`Filter milestones by team`}
                      title={t`Filter by team`}
                    >
                      <Users className="h-4 w-4" />
                      {milestoneOwnerGroupFilterIds.length > 0 && (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {milestoneOwnerGroupFilterIds.length}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-3" align="start">
                    <div className="flex items-center justify-between pb-2">
                      <span className="text-[11px] text-muted-foreground">{t`Filter by team`}</span>
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={onClearMilestoneOwnerGroupFilters}
                      >
                        {t`Clear`}
                      </button>
                    </div>
                    <ScrollArea className="max-h-56 pr-2">
                      <div className="space-y-1">
                        <label className="flex cursor-pointer items-center gap-2 py-1">
                          <Checkbox
                            checked={milestoneOwnerGroupFilterIds.includes('none')}
                            onCheckedChange={() => onToggleMilestoneOwnerGroupFilter('none')}
                          />
                          <span className="text-sm">{t`No team`}</span>
                        </label>
                        {memberGroups.length === 0 && (
                          <div className="text-xs text-muted-foreground">{t`No teams yet.`}</div>
                        )}
                        {memberGroups.map((group) => (
                          <label key={group.id} className="flex cursor-pointer items-center gap-2 py-1">
                            <Checkbox
                              checked={milestoneOwnerGroupFilterIds.includes(group.id)}
                              onCheckedChange={() => onToggleMilestoneOwnerGroupFilter(group.id)}
                            />
                            <span className="truncate text-sm">{group.name}</span>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2"
                  onClick={onToggleNameSort}
                >
                  {nameSort === 'asc' ? (
                    <ArrowDownAZ className="h-4 w-4" />
                  ) : (
                    <ArrowDownZA className="h-4 w-4" />
                  )}
                  <span className="text-xs text-muted-foreground">{nameSortLabel}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2"
                  onClick={onCycleMilestoneGroup}
                  title={t`Group milestones`}
                >
                  <Layers className="h-4 w-4" />
                  <span className="text-xs text-muted-foreground">{milestoneGroupLabel}</span>
                </Button>
              </div>
            </div>
          </div>
          <TabsList className="mx-4 mt-2 grid grid-cols-2">
            <TabsTrigger value="active">{t`Current`}</TabsTrigger>
            <TabsTrigger value="past">{t`Past`}</TabsTrigger>
          </TabsList>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-3">
            {milestones.length === 0 && (
              <div className="text-sm text-muted-foreground">{t`No milestones yet.`}</div>
            )}
            {milestones.length > 0 && visibleMilestones.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {milestoneTab === 'active' ? t`No current milestones.` : t`No past milestones.`}
              </div>
            )}
            {milestones.length > 0 && visibleMilestones.length > 0 && renderMilestoneGroups()}
          </div>
        </Tabs>
      )}

      {mode === 'projects' && (
        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value as ProjectTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {compactFilters ? (
            <div className="border-b border-border">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen((open) => !open)}
                aria-expanded={mobileFiltersOpen}
                className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
              >
                <span className="inline-flex items-center gap-2">
                  <Search className="h-3.5 w-3.5" />
                  {t`Search & filters`}
                  {hasActiveProjectFilters && !mobileFiltersOpen ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  ) : null}
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', mobileFiltersOpen && 'rotate-180')}
                />
              </button>
            </div>
          ) : null}
          <div
            className={cn(
              compactFilters
                ? mobileFiltersOpen
                  ? 'px-4 pb-3 pt-1 border-b border-border'
                  : 'hidden'
                : 'px-4 py-3 border-b border-border',
            )}
          >
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <SearchInput
                inputClassName="h-8"
                placeholder={t`Search projects...`}
                value={projectSearch}
                onValueChange={onProjectSearchChange}
                clearLabel={t`Clear search`}
              />
              <div className="flex items-center justify-end gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-2 px-2">
                      <Filter className="h-4 w-4" />
                      <span className="text-xs text-muted-foreground">{customerFilterLabel}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-60 p-3" align="start">
                    <div className="flex items-center justify-between pb-2">
                      <span className="text-xs text-muted-foreground">{t`Filter customers`}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onClearCustomerFilters}
                      >
                        {t`Clear`}
                      </Button>
                    </div>
                    <ScrollArea className="max-h-56 pr-2">
                      <div className="space-y-1">
                        <label className="flex items-center gap-2 py-1 cursor-pointer">
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
                          <label key={customer.id} className="flex items-center gap-2 py-1 cursor-pointer">
                            <Checkbox
                              checked={customerFilterIds.includes(customer.id)}
                              onCheckedChange={() => onToggleCustomerFilter(customer.id)}
                            />
                            <span className="text-sm truncate">{customer.name}</span>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2"
                  onClick={onToggleNameSort}
                >
                  {nameSort === 'asc' ? (
                    <ArrowDownAZ className="h-4 w-4" />
                  ) : (
                    <ArrowDownZA className="h-4 w-4" />
                  )}
                  <span className="text-xs text-muted-foreground">{nameSortLabel}</span>
                </Button>
                <Button
                  variant={groupByCustomer ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2"
                  onClick={onToggleGroupByCustomer}
                  aria-pressed={groupByCustomer}
                  title={t`Group by customer`}
                >
                  <Layers className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <TabsList className="mx-4 mt-2 grid grid-cols-2">
            <TabsTrigger value="active">{t`Active`}</TabsTrigger>
            <TabsTrigger value="archived">{t`Archived`}</TabsTrigger>
          </TabsList>
          <TabsContent value="active" className="mt-0 flex-1 min-h-0 overflow-hidden">
            <div className="h-full overflow-y-auto overflow-x-hidden px-4 py-3">
              {activeProjects.length === 0 && (
                <div className="text-sm text-muted-foreground">{t`No active projects.`}</div>
              )}
              {activeProjects.length > 0 && renderProjectGroups(filteredActiveProjects, false)}
            </div>
          </TabsContent>
          <TabsContent value="archived" className="mt-0 flex-1 min-h-0 overflow-hidden">
            <div className="h-full overflow-y-auto overflow-x-hidden px-4 py-3">
              {archivedProjects.length === 0 && (
                <div className="text-sm text-muted-foreground">{t`No archived projects.`}</div>
              )}
              {archivedProjects.length > 0 && renderProjectGroups(filteredArchivedProjects, true)}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </aside>
  );
};
