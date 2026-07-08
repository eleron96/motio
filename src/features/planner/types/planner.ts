export type TaskPriority = 'low' | 'medium' | 'high';
export type RepeatTaskUpdateScope = 'single' | 'following' | 'all';

export interface Task {
  id: string;
  title: string;
  projectId: string | null;
  assigneeIds: string[];
  startDate: string; // ISO date
  endDate: string; // ISO date
  statusId: string;
  typeId: string;
  priority: TaskPriority | null;
  tagIds: string[];
  description: string | null | undefined;
  repeatId: string | null;
  /**
   * Persisted recurrence end mode for the series (never / until date / after N).
   * Only the mode is stored; count and until are always derived from the actual
   * series rows. Null/undefined for legacy series created before this was stored
   * (and for partial fetches) — the task panel then infers the mode from rows.
   */
  repeatEnds?: 'never' | 'on' | 'after' | null;
  /** ISO timestamps; optional because older fixtures/partial fetches may omit them. */
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskSubtask {
  id: string;
  taskId: string;
  title: string;
  isDone: boolean;
  doneAt: string | null;
  position: number;
}

export interface Project {
  id: string;
  name: string;
  code: string | null;
  color: string; // hex
  archived: boolean;
  customerId: string | null;
  /** Phase 2: workspace MemberGroup that owns this project (Юсов / Ладыгина / etc.). */
  ownerGroupId: string | null;
  /** Phase 7.5: free-form status, e.g. «В работе», «Заморожен», «Завершен». */
  status: string | null;
}

export interface Customer {
  id: string;
  name: string;
  /** Phase 3: free-form industry / segment label, e.g. «Девелопмент · Жилая». */
  industry: string | null;
}

/** Phase 3: a person on the customer side (Project Card → Customer block). */
export interface CustomerContact {
  id: string;
  /** Null for standalone contacts entered from the Contacts tab (no client). */
  customerId: string | null;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  position: number;
  /** Free-form firm/company, mirroring an external member's company (0111). */
  company: string | null;
  /** Phase 7: free-form tag for grouping (e.g. «субподрядчик», «BIM-менеджер»). */
  tag: string | null;
}

export interface Assignee {
  id: string;
  name: string;
  avatar?: string;
  userId?: string | null;
  isActive: boolean;
  /** Phase 4: optional contact info shown in the project-card Team popup. */
  email: string | null;
  phone: string | null;
}

/**
 * Phase 4: explicit per-project membership. Decoupled from task assignment so
 * a person can be on the team even before any tasks are scheduled for them.
 */
export interface ProjectMember {
  id: string;
  projectId: string;
  /**
   * Phase 4: workspace assignee link. Phase 7 made this nullable so that
   * external (non-Motio) people can be added — at least one of `assigneeId`
   * or `externalName` must be set, enforced by a CHECK constraint in 0086.
   */
  assigneeId: string | null;
  role: string | null;
  position: number;
  /** Phase 7: free-form grouping label (e.g. «субподрядчик»). */
  tag: string | null;
  /** Phase 7: external person fields. Used when `assigneeId` is null. */
  externalName: string | null;
  externalCompany: string | null;
  externalEmail: string | null;
  externalPhone: string | null;
}

/**
 * Phase 6: per-project activity feed. v1 only carries `kind = 'comment'`;
 * system kinds (milestone_done, task_added, ...) can be added later without
 * the consumer having to special-case them.
 */
export type ProjectActivityKind = 'comment';

export interface ProjectActivity {
  id: string;
  projectId: string;
  authorId: string | null;
  authorDisplayName: string;
  kind: ProjectActivityKind;
  content: string;
  createdAt: string;
  updatedAt: string;
  /** updatedAt > createdAt by more than 1 second */
  isEdited: boolean;
  /** Workspace-wide flag — pinned notes sort to the top of the project feed. */
  pinned: boolean;
}

export interface MemberGroup {
  id: string;
  name: string;
}

export interface MemberGroupAssignment {
  userId: string;
  groupId: string | null;
}

export interface Status {
  id: string;
  name: string;
  emoji: string | null;
  color: string; // hex
  isFinal: boolean;
  isCancelled: boolean;
}

export interface TaskType {
  id: string;
  name: string;
  icon: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string; // hex
}

export type MilestoneStatusOverride = 'done' | 'current' | 'upcoming';

export interface Milestone {
  id: string;
  title: string;
  projectId: string;
  date: string; // ISO date
  /** Phase 5: short context note shown below the title on the project card. */
  note: string | null;
  /** Phase 5: explicit status; when null, status is derived from `date`. */
  statusOverride: MilestoneStatusOverride | null;
}

export type CommentAuthorStatus = 'ACTIVE' | 'PENDING_DELETION' | 'PURGED';

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  authorDisplayName: string;
  authorStatus: CommentAuthorStatus;
  content: string; // sanitized HTML
  mentionedUserIds: string[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  isEdited: boolean; // updatedAt > createdAt by more than 1 second
}

export type ViewMode = 'day' | 'week' | 'calendar';
export type GroupMode = 'assignee' | 'project';

export interface Filters {
  projectIds: string[];
  assigneeIds: string[];
  groupIds: string[];
  statusIds: string[];
  typeIds: string[];
  tagIds: string[];
  hideUnassigned: boolean;
}

export interface PlannerState {
  tasks: Task[];
  milestones: Milestone[];
  projects: Project[];
  trackedProjectIds: string[];
  customers: Customer[];
  customerContacts: CustomerContact[];
  assignees: Assignee[];
  projectMembers: ProjectMember[];
  projectActivity: ProjectActivity[];
  memberGroups: MemberGroup[];
  memberGroupAssignments: MemberGroupAssignment[];
  statuses: Status[];
  taskTypes: TaskType[];
  tags: Tag[];
  viewMode: ViewMode;
  groupMode: GroupMode;
  currentDate: string;
  filters: Filters;
  selectedTaskId: string | null;
  highlightedTaskId: string | null;
  highlightedTaskRowAssigneeId: string | null;
  timelineAttentionDate: string | null;
}
