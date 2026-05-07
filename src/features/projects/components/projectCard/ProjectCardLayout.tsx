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
    payload: { customerId: string; name: string; role: string | null; email: string | null; phone: string | null }
  ) => Promise<void>;
  onDeleteCustomerContact: (id: string) => Promise<void>;
  /** Phase 1 fallback list — assignees that appear on this project's tasks. */
  projectMembers: Assignee[];
  /** Phase 4 explicit members of this project. */
  projectMemberRows: ProjectMember[];
  assigneesById: Map<string, Assignee>;
  workspaceAssignees: Assignee[];
  onAddProjectMember: (assigneeId: string, role: string | null) => Promise<void>;
  onRemoveProjectMember: (memberId: string) => Promise<void>;
  onUpdateAssigneeContact: (assigneeId: string, email: string | null, phone: string | null) => Promise<void>;
  projectMilestones: Milestone[];
  formatMilestoneDate: (date: string) => string;
  today: Date;
  /** Phase 6 — activity feed for this project. */
  projectActivity: ProjectActivity[];
  formatActivityTimestamp: (iso: string) => string;
  onAddActivity: (content: string) => Promise<void>;
  onUpdateActivity: (id: string, content: string) => Promise<void>;
  onDeleteActivity: (id: string) => Promise<void>;

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
}

export const ProjectCardLayout: React.FC<ProjectCardLayoutProps> = (props) => {
  const {
    selectedProject,
    customer,
    customerContacts,
    canEdit,
    onAddCustomerContact,
    onDeleteCustomerContact,
    projectMembers,
    projectMemberRows,
    assigneesById,
    workspaceAssignees,
    onAddProjectMember,
    onRemoveProjectMember,
    onUpdateAssigneeContact,
    projectMilestones,
    formatMilestoneDate,
    today,
    projectActivity,
    formatActivityTimestamp,
    onAddActivity,
    onUpdateActivity,
    onDeleteActivity,
    ...taskProps
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 p-6">
        <ProjectCardHeader project={selectedProject} customer={customer} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
          <CustomerBlock
            customer={customer}
            contacts={customerContacts}
            accentColor={selectedProject.color}
            canEdit={canEdit}
            onAddContact={onAddCustomerContact}
            onDeleteContact={onDeleteCustomerContact}
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
          />
          <MilestonesBlock
            milestones={projectMilestones}
            formatDate={formatMilestoneDate}
            today={today}
          />
        </div>

        <ActivityBlock
          entries={projectActivity}
          canEdit={canEdit}
          formatDate={formatActivityTimestamp}
          onAdd={onAddActivity}
          onUpdate={onUpdateActivity}
          onDelete={onDeleteActivity}
        />

        <TasksBlock {...taskProps} />
      </div>
    </div>
  );
};
