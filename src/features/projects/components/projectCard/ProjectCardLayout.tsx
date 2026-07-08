import React from 'react';
import type {
  Assignee,
  Customer,
  CustomerContact,
  Milestone,
  Project,
  ProjectActivity,
  ProjectMember,
  Status,
  Task,
} from '@/features/planner/types/planner';
import type { KnownPerson } from '@/features/projects/lib/knownPeople';
import type { TaskScope } from '@/shared/domain/taskScope';
import type { RepeatCadence } from '@/shared/domain/repeatSeries';
import { ProjectCardHeader } from './ProjectCardHeader';
import { CustomerBlock } from './CustomerBlock';
import { TeamBlock } from './TeamBlock';
import { MilestonesBlock } from './MilestonesBlock';
import { ActivityBlock } from './ActivityBlock';
import { TasksBlock } from './TasksBlock';

type DisplayTaskRow = {
  key: string;
  task: Task;
  repeatMeta: {
    cadence: RepeatCadence;
    remaining: number;
    total: number;
  } | null;
};

interface ProjectCardLayoutProps {
  selectedProject: Project;
  customer: Customer | null;
  customerContacts: CustomerContact[];
  canEdit: boolean;
  onAddCustomerContact: (
    payload: { customerId: string; name: string; role: string | null; email: string | null; phone: string | null; tag: string | null }
  ) => Promise<boolean>;
  onDeleteCustomerContact: (id: string) => Promise<boolean>;
  onUpdateCustomerContact: (
    id: string,
    updates: { name?: string; role?: string | null; email?: string | null; phone?: string | null; tag?: string | null },
  ) => Promise<boolean>;
  /** Fallback list — assignees that appear on this project's tasks. */
  projectMembers: Assignee[];
  /** Explicit members of this project (project_members rows). */
  projectMemberRows: ProjectMember[];
  assigneesById: Map<string, Assignee>;
  workspaceAssignees: Assignee[];
  onAddProjectMember: (input: import('./TeamBlock').AddMemberInput) => Promise<boolean>;
  onRemoveProjectMember: (memberId: string) => Promise<boolean>;
  onUpdateAssigneeContact: (assigneeId: string, email: string | null, phone: string | null) => Promise<boolean>;
  onUpdateExternalMember: (
    memberId: string,
    updates: Partial<Pick<ProjectMember,
      'externalName' | 'externalCompany' | 'externalEmail' | 'externalPhone' | 'role' | 'tag'
    >>,
  ) => Promise<boolean>;
  /** Workspace-wide people to suggest in the add forms. Empty when the flag is off. */
  knownPeople?: readonly KnownPerson[];
  projectMilestones: Milestone[];
  formatMilestoneDate: (date: string) => string;
  today: Date;
  onAddMilestone: () => void;
  onEditMilestone?: (milestone: Milestone) => void;
  onSaveProjectStatus: (next: string | null) => Promise<boolean>;
  isProjectTracked: boolean;
  onToggleProjectTracked: () => void;
  onOpenProjectSettings?: () => void;
  onToggleProjectArchived?: () => void;
  onRequestDeleteProject?: () => void;
  /** Activity feed for this project. */
  projectActivity: ProjectActivity[];
  formatActivityTimestamp: (iso: string) => string;
  onAddActivity: (content: string) => Promise<boolean>;
  onUpdateActivity: (id: string, content: string) => Promise<boolean>;
  onDeleteActivity: (id: string) => Promise<boolean>;
  onSetActivityPinned: (id: string, pinned: boolean) => Promise<boolean>;
  /** Workspace id used by the activity rich-text editor for image uploads. */
  workspaceId?: string | null;

  // Tasks data + handlers — same shape as ProjectsMainPanel consumes.
  taskScope: TaskScope;
  onChangeTaskScope: (scope: TaskScope) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statuses: Status[];
  statusFilterIds: string[];
  onToggleStatus: (id: string) => void;
  setStatusPreset: (mode: 'all' | 'open' | 'done') => void;
  statusFilterLabel: string;
  assigneeOptions: Assignee[];
  assigneeFilterIds: string[];
  onToggleAssignee: (id: string) => void;
  assigneeFilterLabel: string;
  onClearFilters: () => void;
  onRefreshTasks: () => void;
  tasksLoading: boolean;
  tasksError: string;
  displayTaskRows: DisplayTaskRow[];
  statusById: Map<string, Status>;
  assigneeById: Map<string, Assignee>;
  onSelectTask: (taskId: string) => void;
  pageIndex: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  totalCount: number;
  onAddTask?: () => void;
}

export const ProjectCardLayout: React.FC<ProjectCardLayoutProps> = (props) => {
  const {
    selectedProject,
    customer,
    customerContacts,
    canEdit,
    onAddCustomerContact,
    onDeleteCustomerContact,
    onUpdateCustomerContact,
    projectMembers,
    projectMemberRows,
    assigneesById,
    workspaceAssignees,
    onAddProjectMember,
    onRemoveProjectMember,
    onUpdateAssigneeContact,
    onUpdateExternalMember,
    knownPeople,
    projectMilestones,
    formatMilestoneDate,
    today,
    onAddMilestone,
    onEditMilestone,
    onSaveProjectStatus,
    isProjectTracked,
    onToggleProjectTracked,
    onOpenProjectSettings,
    onToggleProjectArchived,
    onRequestDeleteProject,
    projectActivity,
    formatActivityTimestamp,
    onAddActivity,
    onUpdateActivity,
    onDeleteActivity,
    onSetActivityPinned,
    workspaceId,
    ...taskProps
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-3 p-3 sm:gap-4 sm:p-6">
        <ProjectCardHeader
          project={selectedProject}
          customer={customer}
          canEdit={canEdit}
          onSaveStatus={onSaveProjectStatus}
          isTracked={isProjectTracked}
          onToggleTracked={onToggleProjectTracked}
          onOpenSettings={onOpenProjectSettings}
          onToggleArchived={onToggleProjectArchived}
          onRequestDelete={onRequestDeleteProject}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
          <CustomerBlock
            customer={customer}
            contacts={customerContacts}
            accentColor={selectedProject.color}
            canEdit={canEdit}
            onAddContact={onAddCustomerContact}
            onDeleteContact={onDeleteCustomerContact}
            onUpdateContact={onUpdateCustomerContact}
            people={knownPeople}
          />
          <TeamBlock
            members={projectMemberRows}
            taskFallbackMembers={projectMembers}
            assigneesById={assigneesById}
            workspaceAssignees={workspaceAssignees}
            canEdit={canEdit}
            onAddMember={onAddProjectMember}
            onRemoveMember={onRemoveProjectMember}
            onUpdateAssigneeContact={onUpdateAssigneeContact}
            onUpdateExternalMember={onUpdateExternalMember}
            people={knownPeople}
          />
          <MilestonesBlock
            milestones={projectMilestones}
            formatDate={formatMilestoneDate}
            today={today}
            canEdit={canEdit}
            onAddMilestone={onAddMilestone}
            onEditMilestone={onEditMilestone}
            accentColor={selectedProject.color}
          />
        </div>

        <ActivityBlock
          entries={projectActivity}
          canEdit={canEdit}
          formatDate={formatActivityTimestamp}
          onAdd={onAddActivity}
          onUpdate={onUpdateActivity}
          onDelete={onDeleteActivity}
          onSetPinned={onSetActivityPinned}
          workspaceId={workspaceId}
        />

        <TasksBlock {...taskProps} canEdit={canEdit} />
      </div>
    </div>
  );
};
