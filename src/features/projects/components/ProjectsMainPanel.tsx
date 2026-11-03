import React from 'react';
import { t } from '@lingui/macro';
import { CalendarDays, MoreHorizontal } from 'lucide-react';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Assignee, Customer, CustomerContact, Milestone, Project, ProjectActivity, ProjectMember, Status, Task } from '@/features/planner/types/planner';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';
import type { TaskScope } from '@/shared/domain/taskScope';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { collectKnownPeople } from '@/features/projects/lib/knownPeople';
import { ProjectCardLayout } from '@/features/projects/components/projectCard/ProjectCardLayout';

type DisplayTaskRow = {
  key: string;
  task: Task;
  repeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
};

export type ProjectsMainPanelProps = {
  // 'contacts' never renders here (the page shows a full-width panel for it),
  // but the shared mode type includes it.
  mode: 'projects' | 'milestones' | 'customers' | 'contacts';
  selectedProject: Project | null;
  customerById: Map<string, Customer>;
  taskScope: TaskScope;
  onChangeTaskScope: (scope: TaskScope) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilterLabel: string;
  setStatusPreset: (mode: 'all' | 'open' | 'done') => void;
  statuses: Status[];
  statusFilterIds: string[];
  onToggleStatus: (statusId: string) => void;
  assigneeFilterLabel: string;
  assigneeOptions: Assignee[];
  assigneeFilterIds: string[];
  onToggleAssignee: (assigneeId: string) => void;
  onClearFilters: () => void;
  onRefreshTasks: () => void;
  onAddTask?: () => void;
  tasksLoading: boolean;
  tasksError: string;
  displayTaskRows: DisplayTaskRow[];
  displayTotalCount: number;
  pageIndex: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  statusById: Map<string, Status>;
  assigneeById: Map<string, Assignee>;
  onSelectTask: (taskId: string) => void;
  selectedMilestone: Milestone | null;
  selectedMilestoneProject: Project | null;
  selectedMilestoneCustomer: Customer | null;
  formatMilestoneDate: (date: string) => string;
  trackedProjectIdSet: Set<string>;
  onOpenProjectFromMilestone: (milestone: Milestone) => void;
  onOpenMilestoneSettings: (milestone: Milestone) => void;
  onRequestDeleteMilestone: (milestone: Milestone) => void;
  canEdit: boolean;
  selectedCustomer: Customer | null;
  selectedCustomerProjects: Project[];
  customersCount: number;
  onOpenProjectFromCustomer: (project: Project) => void;
  /** Same handlers the customers-sidebar context menu uses — wired through
   * here so the detail panel can render its own kebab dropdown. */
  onStartCustomerEdit: (customerId: string, customerName: string, industry?: string | null) => void;
  onRequestDeleteCustomer: (customer: Customer) => void;
  /**
   * Only consumed in `mode === 'projects'`.
   * Computed in ProjectsPage from existing data.
   */
  projectMembers: Assignee[];
  projectMilestones: Milestone[];
  today: Date;
  onCreateMilestoneForProject: (projectId: string) => void;
  onEditMilestone: (milestone: Milestone) => void;
  onSaveProjectStatus: (projectId: string, next: string | null) => Promise<boolean>;
  /** Per-user tracking + project actions for the card header. */
  onToggleProjectTracked: (projectId: string, nextTracked: boolean) => void;
  onOpenProjectSettings: (project: Project) => void;
  onToggleProjectArchived: (project: Project) => void;
  onRequestDeleteProject: (project: Project) => void;
  /** Customer contacts list + handlers wired through plannerStore. */
  customerContacts: CustomerContact[];
  onAddCustomerContact: (
    payload: { customerId: string; name: string; company: string | null; role: string | null; email: string | null; phone: string | null; tag: string | null }
  ) => Promise<boolean>;
  onDeleteCustomerContact: (id: string) => Promise<boolean>;
  onUpdateCustomerContact: (
    id: string,
    updates: { name?: string; company?: string | null; role?: string | null; email?: string | null; phone?: string | null; tag?: string | null },
  ) => Promise<boolean>;
  /** Explicit project members + handlers. */
  projectMemberRows: ProjectMember[];
  workspaceAssignees: Assignee[];
  onAddProjectMember: (
    projectId: string,
    input: import('./projectCard/TeamBlock').AddMemberInput,
  ) => Promise<boolean>;
  onRemoveProjectMember: (memberId: string) => Promise<boolean>;
  onUpdateAssigneeContact: (assigneeId: string, email: string | null, phone: string | null) => Promise<boolean>;
  onUpdateExternalMember: (
    memberId: string,
    updates: Partial<Pick<ProjectMember,
      'externalName' | 'externalCompany' | 'externalEmail' | 'externalPhone' | 'role' | 'tag'
    >>,
  ) => Promise<boolean>;
  /** Activity feed entries for the whole workspace + handlers. */
  projectActivity: ProjectActivity[];
  formatActivityTimestamp: (iso: string) => string;
  onAddProjectActivity: (projectId: string, content: string) => Promise<boolean>;
  onUpdateProjectActivity: (id: string, content: string) => Promise<boolean>;
  onDeleteProjectActivity: (id: string) => Promise<boolean>;
  onSetProjectActivityPinned: (id: string, pinned: boolean) => Promise<boolean>;
  /** Workspace id used by the activity rich-text editor for image uploads. */
  workspaceId?: string | null;
};

export const ProjectsMainPanel = ({
  mode,
  selectedProject,
  customerById,
  taskScope,
  onChangeTaskScope,
  search,
  onSearchChange,
  statusFilterLabel,
  setStatusPreset,
  statuses,
  statusFilterIds,
  onToggleStatus,
  assigneeFilterLabel,
  assigneeOptions,
  assigneeFilterIds,
  onToggleAssignee,
  onClearFilters,
  onRefreshTasks,
  onAddTask,
  tasksLoading,
  tasksError,
  displayTaskRows,
  displayTotalCount,
  pageIndex,
  totalPages,
  onPrevPage,
  onNextPage,
  statusById,
  assigneeById,
  onSelectTask,
  selectedMilestone,
  selectedMilestoneProject,
  selectedMilestoneCustomer,
  formatMilestoneDate,
  trackedProjectIdSet,
  onOpenProjectFromMilestone,
  onOpenMilestoneSettings,
  onRequestDeleteMilestone,
  canEdit,
  selectedCustomer,
  selectedCustomerProjects,
  customersCount,
  onOpenProjectFromCustomer,
  onStartCustomerEdit,
  onRequestDeleteCustomer,
  projectMembers,
  projectMilestones,
  today,
  onCreateMilestoneForProject,
  onEditMilestone,
  onSaveProjectStatus,
  onToggleProjectTracked,
  onOpenProjectSettings,
  onToggleProjectArchived,
  onRequestDeleteProject,
  customerContacts,
  onAddCustomerContact,
  onDeleteCustomerContact,
  onUpdateCustomerContact,
  projectMemberRows,
  workspaceAssignees,
  onAddProjectMember,
  onRemoveProjectMember,
  onUpdateAssigneeContact,
  onUpdateExternalMember,
  projectActivity,
  formatActivityTimestamp,
  onAddProjectActivity,
  onUpdateProjectActivity,
  onDeleteProjectActivity,
  onSetProjectActivityPinned,
  workspaceId,
}: ProjectsMainPanelProps) => {
  const isMobile = useIsMobile();
  const sectionPadding = isMobile ? 'px-4 py-3' : 'px-6 py-4';

  // Memoize per-project slices so we don't re-allocate filtered arrays on every
  // unrelated re-render (these arrays span the whole workspace). Defensive
  // defaults guard against tests that mount the panel with partial props.
  const cardCustomerId = selectedProject?.customerId ?? null;
  const cardProjectId = selectedProject?.id ?? null;
  const filteredCustomerContacts = React.useMemo(
    () => (customerContacts ?? []).filter((contact) => contact.customerId === (cardCustomerId ?? '')),
    [customerContacts, cardCustomerId],
  );
  const filteredProjectMemberRows = React.useMemo(
    () => (projectMemberRows ?? []).filter((row) => row.projectId === cardProjectId),
    [projectMemberRows, cardProjectId],
  );
  const filteredProjectActivity = React.useMemo(
    () => (projectActivity ?? []).filter((entry) => entry.projectId === cardProjectId),
    [projectActivity, cardProjectId],
  );
  // Workspace-wide reusable people for the add-contact / add-member suggestions.
  // Built from the UNfiltered props on purpose — the whole point is to surface
  // people entered on OTHER projects/customers.
  const knownPeople = React.useMemo(
    () => collectKnownPeople(customerContacts ?? [], projectMemberRows ?? []),
    [customerContacts, projectMemberRows],
  );

  // A selected project is shown as the project card, on desktop and phone.
  // Milestones / customers / contacts modes render below.
  if (mode === 'projects' && selectedProject) {
    return (
      <ProjectCardLayout
        selectedProject={selectedProject}
        customer={customerById.get(selectedProject.customerId ?? '') ?? null}
        customerContacts={filteredCustomerContacts}
        canEdit={canEdit}
        onAddCustomerContact={onAddCustomerContact}
        onDeleteCustomerContact={onDeleteCustomerContact}
        onUpdateCustomerContact={onUpdateCustomerContact}
        projectMembers={projectMembers}
        projectMemberRows={filteredProjectMemberRows}
        assigneesById={assigneeById}
        workspaceAssignees={workspaceAssignees}
        onAddProjectMember={(input) => onAddProjectMember(selectedProject.id, input)}
        onRemoveProjectMember={onRemoveProjectMember}
        onUpdateAssigneeContact={onUpdateAssigneeContact}
        onUpdateExternalMember={onUpdateExternalMember}
        knownPeople={knownPeople}
        projectActivity={filteredProjectActivity}
        formatActivityTimestamp={formatActivityTimestamp}
        onAddActivity={(content) => onAddProjectActivity(selectedProject.id, content)}
        onUpdateActivity={onUpdateProjectActivity}
        onDeleteActivity={onDeleteProjectActivity}
        onSetActivityPinned={onSetProjectActivityPinned}
        workspaceId={workspaceId}
        projectMilestones={projectMilestones}
        formatMilestoneDate={formatMilestoneDate}
        today={today}
        onAddMilestone={() => onCreateMilestoneForProject(selectedProject.id)}
        onEditMilestone={onEditMilestone}
        onSaveProjectStatus={(next) => onSaveProjectStatus(selectedProject.id, next)}
        isProjectTracked={trackedProjectIdSet.has(selectedProject.id)}
        onToggleProjectTracked={() => onToggleProjectTracked(selectedProject.id, !trackedProjectIdSet.has(selectedProject.id))}
        onOpenProjectSettings={() => onOpenProjectSettings(selectedProject)}
        onToggleProjectArchived={() => onToggleProjectArchived(selectedProject)}
        onRequestDeleteProject={() => onRequestDeleteProject(selectedProject)}
        taskScope={taskScope}
        onChangeTaskScope={onChangeTaskScope}
        search={search}
        onSearchChange={onSearchChange}
        statuses={statuses}
        statusFilterIds={statusFilterIds}
        onToggleStatus={onToggleStatus}
        setStatusPreset={setStatusPreset}
        statusFilterLabel={statusFilterLabel}
        assigneeOptions={assigneeOptions}
        assigneeFilterIds={assigneeFilterIds}
        onToggleAssignee={onToggleAssignee}
        assigneeFilterLabel={assigneeFilterLabel}
        onClearFilters={onClearFilters}
        onRefreshTasks={onRefreshTasks}
        tasksLoading={tasksLoading}
        tasksError={tasksError}
        displayTaskRows={displayTaskRows}
        statusById={statusById}
        assigneeById={assigneeById}
        onSelectTask={onSelectTask}
        pageIndex={pageIndex}
        totalPages={totalPages}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
        totalCount={displayTotalCount}
        onAddTask={onAddTask}
      />
    );
  }

  return (
    <section data-tour="projects-main-panel" className="h-full min-h-0 min-w-0 overflow-hidden flex flex-col">
      {mode === 'projects' ? (
        <>
          {!selectedProject && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t`Select a project to view details.`}
            </div>
          )}
        </>
      ) : mode === 'milestones' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {!selectedMilestone && (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t`Select a milestone to view details.`}
            </div>
          )}
          {selectedMilestone && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className={`border-b border-border ${sectionPadding}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <CalendarDays className="mt-1 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="text-lg font-semibold break-words [overflow-wrap:anywhere]">
                        {selectedMilestone.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatMilestoneDate(selectedMilestone.date)}
                      </div>
                      <div className="text-xs text-muted-foreground leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                        {selectedMilestoneProject
                          ? formatProjectLabel(selectedMilestoneProject.name, selectedMilestoneProject.code)
                          : t`Unknown project`}
                      </div>
                    </div>
                    {selectedMilestoneProject?.archived && (
                      <Badge variant="secondary">{t`Archived`}</Badge>
                    )}
                  </div>
                  <div className={isMobile ? 'flex w-full flex-col gap-2' : 'flex items-center gap-2'}>
                    <Button
                      variant="outline"
                      className={isMobile ? 'w-full' : undefined}
                      onClick={() => onOpenProjectFromMilestone(selectedMilestone)}
                      disabled={!selectedMilestoneProject}
                    >
                      {t`Open project`}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size={isMobile ? undefined : 'icon'}
                          className={isMobile ? 'w-full' : undefined}
                          aria-label={t`Milestone actions`}
                          disabled={!canEdit}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          {isMobile && <span className="ml-2">{t`Actions`}</span>}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          disabled={!canEdit}
                          onSelect={() => onOpenMilestoneSettings(selectedMilestone)}
                        >
                          {t`Edit`}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={!canEdit}
                          onSelect={() => onRequestDeleteMilestone(selectedMilestone)}
                          className="text-destructive focus:text-destructive"
                        >
                          {t`Delete`}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
              <div className={`flex-1 overflow-auto ${sectionPadding}`}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{t`Date`}</div>
                    <div className="text-sm">{formatMilestoneDate(selectedMilestone.date)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t`Project`}</div>
                    <div className="text-sm break-words [overflow-wrap:anywhere]">
                      {selectedMilestoneProject
                        ? formatProjectLabel(selectedMilestoneProject.name, selectedMilestoneProject.code)
                        : t`Unknown project`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t`Customer`}</div>
                    <div className="text-sm break-words [overflow-wrap:anywhere]">
                      {selectedMilestoneCustomer?.name ?? t`No customer`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t`Tracking`}</div>
                    <div className="text-sm">
                      {trackedProjectIdSet.has(selectedMilestone.projectId) ? t`Tracked project` : t`Not tracked`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className={`border-b border-border ${sectionPadding}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold break-words [overflow-wrap:anywhere]">
                  {selectedCustomer?.name ?? t`Select a customer`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedCustomer
                    ? t`${selectedCustomerProjects.length} projects`
                    : t`${customersCount} customers`}
                </div>
              </div>
              {selectedCustomer && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t`Customer actions`}
                      disabled={!canEdit}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      disabled={!canEdit}
                      onSelect={() => onStartCustomerEdit(
                        selectedCustomer.id,
                        selectedCustomer.name,
                        selectedCustomer.industry,
                      )}
                    >
                      {t`Edit`}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={!canEdit}
                      onSelect={() => onRequestDeleteCustomer(selectedCustomer)}
                      className="text-destructive focus:text-destructive"
                    >
                      {t`Delete`}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <div className={`flex-1 overflow-auto ${sectionPadding}`}>
            {!selectedCustomer && (
              <div className="text-sm text-muted-foreground">{t`Choose a customer to see their projects.`}</div>
            )}
            {selectedCustomer && selectedCustomerProjects.length === 0 && (
              <div className="text-sm text-muted-foreground">{t`No projects assigned to this customer.`}</div>
            )}
            {selectedCustomer && selectedCustomerProjects.length > 0 && (
              <div className="space-y-2">
                {selectedCustomerProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onOpenProjectFromCustomer(project)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug whitespace-normal break-words [overflow-wrap:anywhere] line-clamp-2">
                        {formatProjectLabel(project.name, project.code)}
                      </div>
                      {project.archived && (
                        <div className="text-[10px] text-muted-foreground">{t`Archived`}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
