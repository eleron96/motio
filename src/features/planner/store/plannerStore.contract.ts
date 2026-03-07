import {
  Assignee,
  Customer,
  Filters,
  GroupMode,
  MemberGroup,
  MemberGroupAssignment,
  Milestone,
  PlannerState,
  Project,
  RepeatTaskUpdateScope,
  Status,
  Tag,
  Task,
  TaskSubtask,
  TaskType,
  ViewMode,
} from '@/features/planner/types/planner';
import { MutationResult } from '@/features/planner/store/plannerStore.helpers';
import { WorkspaceTemplate } from '@/shared/domain/workspaceTemplate';

export type PlannerGroup = {
  id: string;
  name: string;
};

export type PlannerGroupMember = {
  userId: string;
  role: 'admin' | 'editor' | 'viewer';
  email: string;
  displayName: string | null;
};

export interface PlannerStore extends PlannerState {
  workspaceId: string | null;
  loading: boolean;
  error: string | null;
  dataRequestId: number;
  loadedRange: {
    start: string;
    end: string;
    viewMode: ViewMode;
    workspaceId: string;
  } | null;
  assigneeTaskCounts: Record<string, number>;
  assigneeCountsDate: string | null;
  assigneeCountsWorkspaceId: string | null;
  scrollRequestId: number;
  scrollTargetDate: string | null;
  timelineInteractingUntil: number;
  setWorkspaceId: (id: string | null) => void;
  loadWorkspaceData: (workspaceId: string) => Promise<void>;
  refreshAssignees: () => Promise<void>;
  refreshMemberGroups: () => Promise<void>;
  fetchAssigneeTaskCounts: (params: {
    workspaceId: string;
    startDate: string;
    endDate: string;
  }) => Promise<{ counts: Record<string, number>; date: string; error?: string }>;
  fetchMemberGroups: (workspaceId: string) => Promise<{ groups: PlannerGroup[]; error?: string }>;
  fetchGroupMembers: (workspaceId: string, groupId: string) => Promise<{ members: PlannerGroupMember[]; error?: string }>;
  createMemberGroup: (workspaceId: string, name: string) => Promise<{ groupId?: string; error?: string }>;
  updateMemberGroup: (workspaceId: string, groupId: string, name: string) => Promise<MutationResult>;
  deleteMemberGroup: (workspaceId: string, groupId: string) => Promise<MutationResult>;
  reset: () => void;
  markTimelineInteraction: (durationMs?: number) => void;
  upsertTasks: (tasks: Task[]) => void;
  removeTasksByIds: (ids: string[]) => void;
  upsertMilestones: (milestones: Milestone[]) => void;
  removeMilestonesByIds: (ids: string[]) => void;

  addTask: (task: Omit<Task, 'id'>) => Promise<Task | null>;
  updateTask: (id: string, updates: Partial<Task>, scope?: RepeatTaskUpdateScope) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteTasks: (ids: string[]) => Promise<{ error?: string }>;
  duplicateTask: (id: string) => Promise<void>;
  createRepeats: (id: string, options: { frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'; ends: 'never' | 'on' | 'after'; untilDate?: string; count?: number }) => Promise<{ error?: string; created?: number }>;
  moveTask: (id: string, startDate: string, endDate: string) => Promise<void>;
  reassignTask: (id: string, assigneeId: string | null, projectId?: string | null) => Promise<void>;
  deleteTaskSeries: (repeatId: string, fromDate: string) => Promise<void>;
  removeAssigneeFromTask: (id: string, assigneeId: string, mode: 'single' | 'following') => Promise<void>;
  fetchTaskSubtasks: (workspaceId: string, taskId: string) => Promise<{ subtasks: TaskSubtask[]; error?: string }>;
  createTaskSubtask: (workspaceId: string, taskId: string, title: string, position: number) => Promise<{ subtask?: TaskSubtask; error?: string }>;
  createTaskSubtasks: (workspaceId: string, taskId: string, titles: string[]) => Promise<MutationResult>;
  updateTaskSubtaskCompletion: (
    workspaceId: string,
    taskId: string,
    subtaskId: string,
    isDone: boolean,
    doneAt: string | null,
  ) => Promise<MutationResult>;
  deleteTaskSubtask: (workspaceId: string, taskId: string, subtaskId: string) => Promise<MutationResult>;

  addProject: (project: Omit<Project, 'id'>) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<MutationResult>;
  deleteProject: (id: string) => Promise<MutationResult>;
  toggleTrackedProject: (projectId: string, isTracked?: boolean) => Promise<void>;

  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<Customer | null>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<MutationResult>;
  deleteCustomer: (id: string) => Promise<MutationResult>;

  addAssignee: (assignee: Omit<Assignee, 'id'>) => Promise<void>;
  updateAssignee: (id: string, updates: Partial<Assignee>) => Promise<void>;
  deleteAssignee: (id: string) => Promise<void>;

  addStatus: (status: Omit<Status, 'id'>) => Promise<void>;
  updateStatus: (id: string, updates: Partial<Status>) => Promise<void>;
  deleteStatus: (id: string) => Promise<void>;

  addTaskType: (taskType: Omit<TaskType, 'id'>) => Promise<void>;
  updateTaskType: (id: string, updates: Partial<TaskType>) => Promise<void>;
  deleteTaskType: (id: string) => Promise<void>;

  addTag: (tag: Omit<Tag, 'id'>) => Promise<void>;
  updateTag: (id: string, updates: Partial<Tag>) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  loadWorkspaceTemplate: () => Promise<{ template?: WorkspaceTemplate; error?: string }>;
  saveWorkspaceTemplate: (template: WorkspaceTemplate) => Promise<MutationResult>;
  applyWorkspaceTemplate: () => Promise<MutationResult>;

  addMilestone: (milestone: Omit<Milestone, 'id'>) => Promise<MutationResult>;
  updateMilestone: (id: string, updates: Partial<Milestone>) => Promise<MutationResult>;
  deleteMilestone: (id: string) => Promise<MutationResult>;

  setViewMode: (mode: ViewMode) => void;
  setGroupMode: (mode: GroupMode) => void;
  setCurrentDate: (date: string) => void;
  requestScrollToDate: (date: string) => void;
  setTimelineAttentionDate: (date: string | null) => void;
  setFilters: (filters: Partial<Filters>) => void;
  clearFilterCriteria: () => void;
  clearFilters: () => void;
  setSelectedTaskId: (id: string | null) => void;
  setHighlightedTaskId: (id: string | null) => void;
}

export type PlannerSetState = (
  partial:
    | PlannerStore
    | Partial<PlannerStore>
    | ((state: PlannerStore) => PlannerStore | Partial<PlannerStore>)
) => void;

export type PlannerGetState = () => PlannerStore;
