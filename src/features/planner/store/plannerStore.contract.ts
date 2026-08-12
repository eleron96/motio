import {
  Assignee,
  Customer,
  CustomerContact,
  Filters,
  GroupMode,
  MemberGroup,
  MemberGroupAssignment,
  Milestone,
  PlannerState,
  Project,
  ProjectActivity,
  ProjectMember,
  RepeatTaskUpdateScope,
  Status,
  Tag,
  Task,
  TaskSubtask,
  TaskType,
  TimeOff,
  TimeOffDragPreview,
  ViewMode,
} from '@/features/planner/types/planner';
import { MutationResult, TimeOffMutationResult } from '@/features/planner/store/plannerStore.helpers';
import { RepeatCreateOptions } from '@/features/planner/lib/taskFormRules';
import { WorkspaceTemplate } from '@/shared/domain/workspaceTemplate';
import { TaskUndoEntry, TaskUndoOutcome } from '@/shared/domain/taskUndo';

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
  taskCommentCounts: Record<string, number>;
  assigneeCountsDate: string | null;
  assigneeCountsWorkspaceId: string | null;
  scrollRequestId: number;
  scrollTargetDate: string | null;
  visibleCenterDate: string | null;
  timelineInteractingUntil: number;
  syncHealthy: boolean;
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
  upsertTaskCommentCounts: (counts: Record<string, number>) => void;
  adjustTaskCommentCount: (taskId: string, delta: number) => void;
  refreshTaskCommentCounts: (workspaceId: string, taskIds: string[]) => Promise<{ error?: string }>;
  upsertMilestones: (milestones: Milestone[]) => void;
  removeMilestonesByIds: (ids: string[]) => void;

  addTask: (task: Omit<Task, 'id'>) => Promise<Task | null>;
  updateTask: (id: string, updates: Partial<Task>, scope?: RepeatTaskUpdateScope) => Promise<void>;
  /** Single-scope update that records an undo entry for status/priority/project changes. */
  updateTaskWithUndo: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteTasks: (ids: string[]) => Promise<{ error?: string }>;
  duplicateTask: (id: string) => Promise<void>;
  createRepeats: (id: string, options: RepeatCreateOptions) => Promise<{ error?: string; created?: number }>;
  updateRepeatSeries: (id: string, options: RepeatCreateOptions, scope?: Exclude<RepeatTaskUpdateScope, 'single'>) => Promise<{ error?: string; created?: number; deleted?: number; updated?: number }>;
  moveTask: (id: string, startDate: string, endDate: string, scope?: RepeatTaskUpdateScope) => Promise<void>;
  moveTaskDetached: (id: string, startDate: string, endDate: string) => Promise<void>;
  reassignTask: (id: string, assigneeId: string | null, projectId?: string | null) => Promise<void>;
  deleteTaskSeries: (repeatId: string, fromDate: string) => Promise<void>;
  removeAssigneeFromTask: (id: string, assigneeId: string, mode: 'single' | 'following') => Promise<void>;
  fetchTaskSubtasks: (workspaceId: string, taskId: string) => Promise<{ subtasks: TaskSubtask[]; error?: string }>;
  createTaskSubtask: (workspaceId: string, taskId: string, title: string, position: number) => Promise<{ subtask?: TaskSubtask; error?: string }>;
  createTaskSubtasks: (workspaceId: string, taskId: string, titles: string[]) => Promise<MutationResult>;
  updateTaskSubtaskTitle: (
    workspaceId: string,
    taskId: string,
    subtaskId: string,
    title: string,
  ) => Promise<MutationResult>;
  updateTaskSubtaskCompletion: (
    workspaceId: string,
    taskId: string,
    subtaskId: string,
    isDone: boolean,
    doneAt: string | null,
  ) => Promise<MutationResult>;
  deleteTaskSubtask: (workspaceId: string, taskId: string, subtaskId: string) => Promise<MutationResult>;
  fetchTaskDescription: (taskId: string) => Promise<void>;

  /**
   * Undo stack for timeline mutations (drag/resize/series moves). Newest
   * first, capped, in-memory only — see `shared/domain/taskUndo.ts`.
   */
  /**
   * Task a deep link is trying to show when its data isn't loaded yet (the bell
   * knows only the id, and the task may sit outside the loaded date window).
   * The planner page picks it up once the task arrives and switches grouping if
   * the project board would hide it.
   */
  pendingRevealTaskId: string | null;
  setPendingRevealTaskId: (taskId: string | null) => void;

  /**
   * Whether the workspace still holds the example project/tasks a brand-new
   * workspace is seeded with. Drives the "keep or clear" choice after the tour
   * and the same action in workspace settings.
   */
  hasSampleData: boolean;
  refreshSampleDataFlag: (workspaceId: string) => Promise<void>;
  clearSampleData: (workspaceId: string) => Promise<MutationResult>;

  taskUndoStack: TaskUndoEntry[];
  /**
   * Task ids hidden by a deferred delete whose window is still open. The rows
   * still exist in the DB, so `upsertTasks` drops incoming updates for them —
   * otherwise live-sync would resurrect a "deleted" task mid-window.
   */
  pendingDeleteTaskIds: string[];
  pushTaskUndo: (entry: TaskUndoEntry) => void;
  /** Undo a specific entry (cascading through newer same-task entries). */
  undoTaskEntry: (entryId: string) => Promise<TaskUndoOutcome | null>;
  /** Undo the most recent entry (Cmd/Ctrl+Z). */
  undoLastTask: () => Promise<TaskUndoOutcome | null>;
  /**
   * Hide the task now, run the real DELETE after the undo window closes.
   * Undo within the window is purely client-side (cancel timer + restore).
   */
  deleteTaskDeferred: (id: string) => Promise<void>;

  addProject: (project: Omit<Project, 'id'>) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<MutationResult>;
  deleteProject: (id: string) => Promise<MutationResult>;
  toggleTrackedProject: (projectId: string, isTracked?: boolean) => Promise<void>;

  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<Customer | null>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<MutationResult>;
  deleteCustomer: (id: string) => Promise<MutationResult>;

  addCustomerContact: (
    contact: Omit<CustomerContact, 'id' | 'position'>,
  ) => Promise<CustomerContact | null>;
  updateCustomerContact: (
    id: string,
    // customerId is allowed so the Contacts tab can attach/detach/move a
    // contact between clients (null = standalone).
    updates: Partial<Omit<CustomerContact, 'id'>>,
  ) => Promise<MutationResult>;
  deleteCustomerContact: (id: string) => Promise<MutationResult>;

  addProjectMember: (
    payload: Omit<ProjectMember, 'id' | 'position'>,
  ) => Promise<ProjectMember | null>;
  updateProjectMember: (
    id: string,
    updates: Partial<Pick<ProjectMember, 'role' | 'position' | 'tag' | 'externalName' | 'externalCompany' | 'externalEmail' | 'externalPhone'>>,
  ) => Promise<MutationResult>;
  deleteProjectMember: (id: string) => Promise<MutationResult>;

  addProjectActivity: (
    payload: { projectId: string; content: string },
  ) => Promise<ProjectActivity | null>;
  updateProjectActivity: (
    id: string,
    updates: { content: string },
  ) => Promise<MutationResult>;
  deleteProjectActivity: (id: string) => Promise<MutationResult>;
  setProjectActivityPinned: (id: string, pinned: boolean) => Promise<MutationResult>;

  addAssignee: (assignee: Omit<Assignee, 'id'>) => Promise<void>;
  updateAssignee: (id: string, updates: Partial<Assignee>) => Promise<MutationResult>;
  /** null resets the person back to the automatic calendar palette. */
  setAssigneeColor: (id: string, color: string | null) => Promise<MutationResult>;
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

  addTimeOff: (input: Omit<TimeOff, 'id'>) => Promise<TimeOffMutationResult>;
  updateTimeOff: (
    id: string,
    updates: Partial<Pick<TimeOff, 'startDate' | 'endDate' | 'note'>>,
  ) => Promise<TimeOffMutationResult>;
  deleteTimeOff: (id: string) => Promise<TimeOffMutationResult>;
  /** Full replace after a realtime refetch — the table is sparse. */
  setTimeOff: (records: TimeOff[]) => void;
  setTimeOffDragPreview: (preview: TimeOffDragPreview) => void;

  setViewMode: (mode: ViewMode) => void;
  setGroupMode: (mode: GroupMode) => void;
  setCurrentDate: (date: string) => void;
  setVisibleCenterDate: (date: string) => void;
  requestScrollToDate: (date: string) => void;
  setTimelineAttentionDate: (date: string | null) => void;
  setFilters: (filters: Partial<Filters>) => void;
  clearFilterCriteria: () => void;
  clearFilters: () => void;
  setSelectedTaskId: (id: string | null) => void;
  setHighlightedTaskId: (id: string | null) => void;
  setHighlightedTaskTarget: (taskId: string | null, rowAssigneeId?: string | null) => void;
  setSyncHealthy: (healthy: boolean) => void;
}

export type PlannerSetState = (
  partial:
    | PlannerStore
    | Partial<PlannerStore>
    | ((state: PlannerStore) => PlannerStore | Partial<PlannerStore>)
) => void;

export type PlannerGetState = () => PlannerStore;
