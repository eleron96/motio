import {
  addMonths,
  addYears,
  format,
  parseISO,
  subMonths,
  subYears,
} from 'date-fns';
import { getStatusEmoji, splitStatusLabel } from '@/shared/lib/statusLabels';
import type { TaskMappedRow } from '@/shared/domain/taskRowMapper';
import {
  Assignee,
  Customer,
  Filters,
  Milestone,
  Project,
  Status,
  Tag,
  Task,
  TaskPriority,
  TaskSubtask,
  TaskType,
  ViewMode,
} from '@/features/planner/types/planner';

export type TaskRow = TaskMappedRow & {
  workspace_id: string;
  priority: TaskPriority | null;
};

export type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  code: string | null;
  color: string;
  archived: boolean;
  customer_id: string | null;
};

export type ProjectTrackingRow = {
  project_id: string;
};

export type CustomerRow = {
  id: string;
  workspace_id: string;
  name: string;
};

export type AssigneeRow = {
  id: string;
  workspace_id: string;
  name: string;
  user_id: string | null;
  is_active: boolean;
};

export type MemberGroupRow = {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
};

export type MemberGroupAssignmentRow = {
  user_id: string;
  group_id: string | null;
};

export type StatusRow = {
  id: string;
  workspace_id: string;
  name: string;
  emoji?: string | null;
  color: string;
  is_final: boolean;
  is_cancelled?: boolean | null;
};

export type TaskTypeRow = {
  id: string;
  workspace_id: string;
  name: string;
  icon: string | null;
};

export type TagRow = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
};

export type MilestoneRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  date: string;
  title: string;
};

export type TaskSubtaskRow = {
  id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  done_at: string | null;
  position: number;
  created_at: string;
};

export type SupabaseResult<T> = {
  data: T;
  error: { message: string } | null;
};

export type MutationResult = {
  error?: string;
};

export type AssigneeUniqueTaskCountRow = {
  assignee_id: string | null;
  total: number | string | null;
};

const LOAD_WINDOW_MONTHS = 6;

export const initialFilters: Filters = {
  projectIds: [],
  assigneeIds: [],
  groupIds: [],
  statusIds: [],
  typeIds: [],
  tagIds: [],
  hideUnassigned: false,
};

export const buildTaskRange = (currentDate: string, viewMode: ViewMode) => {
  const anchor = parseISO(currentDate);
  switch (viewMode) {
    case 'day': {
      const start = subMonths(anchor, LOAD_WINDOW_MONTHS);
      const end = addMonths(anchor, LOAD_WINDOW_MONTHS);
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    }
    case 'calendar': {
      const start = subYears(anchor, 1);
      const end = addYears(anchor, 1);
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    }
    default: {
      const start = subMonths(anchor, LOAD_WINDOW_MONTHS);
      const end = addMonths(anchor, LOAD_WINDOW_MONTHS);
      return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
    }
  }
};

export const isDateWithinRange = (date: string, start: string, end: string) => {
  const target = parseISO(date);
  return target >= parseISO(start) && target <= parseISO(end);
};

export const uniqueAssigneeIds = (assigneeIds: string[] | null | undefined) => (
  Array.from(new Set((assigneeIds ?? []).filter(Boolean)))
);

export const pickActiveAssigneeIds = (assigneeIds: string[] | null | undefined, assignees: Assignee[]) => {
  const activeIds = new Set(
    assignees
      .filter((assignee) => assignee.isActive)
      .map((assignee) => assignee.id),
  );
  return uniqueAssigneeIds(assigneeIds).filter((id) => activeIds.has(id));
};

export const mapProjectRow = (row: ProjectRow): Project => ({
  id: row.id,
  name: row.name,
  code: row.code ?? null,
  color: row.color,
  archived: row.archived ?? false,
  customerId: row.customer_id ?? null,
});

export const mapCustomerRow = (row: CustomerRow): Customer => ({
  id: row.id,
  name: row.name,
});

export const mapAssigneeRow = (row: AssigneeRow): Assignee => ({
  id: row.id,
  name: row.name,
  userId: row.user_id,
  isActive: row.is_active ?? true,
});

export const mapStatusRow = (row: StatusRow): Status => {
  const { name: cleanedName, emoji: inlineEmoji } = splitStatusLabel(row.name);
  const hasEmojiField = Object.prototype.hasOwnProperty.call(row, 'emoji');
  const explicitEmoji = typeof row.emoji === 'string' ? row.emoji.trim() : row.emoji;
  const resolvedEmoji = hasEmojiField
    ? (explicitEmoji || null)
    : (inlineEmoji ?? getStatusEmoji(cleanedName));

  const isCancelled = Boolean(row.is_cancelled);
  return {
    id: row.id,
    name: cleanedName,
    emoji: resolvedEmoji ?? null,
    color: row.color,
    isFinal: Boolean(row.is_final) && !isCancelled,
    isCancelled,
  };
};

export const mapTaskTypeRow = (row: TaskTypeRow): TaskType => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
});

export const mapTagRow = (row: TagRow): Tag => ({
  id: row.id,
  name: row.name,
  color: row.color,
});

export const mapMilestoneRow = (row: MilestoneRow): Milestone => ({
  id: row.id,
  title: row.title,
  projectId: row.project_id,
  date: row.date,
});

export const mapTaskSubtaskRow = (row: TaskSubtaskRow): TaskSubtask => ({
  id: row.id,
  taskId: row.task_id,
  title: row.title,
  isDone: row.is_done,
  doneAt: row.done_at,
  position: row.position,
});

export const mapTaskUpdates = (updates: Partial<Task>) => {
  const payload: Record<string, unknown> = {};
  if ('title' in updates) payload.title = updates.title;
  if ('projectId' in updates) payload.project_id = updates.projectId;
  if ('assigneeIds' in updates) {
    const ids = uniqueAssigneeIds(updates.assigneeIds);
    payload.assignee_ids = ids;
    payload.assignee_id = ids[0] ?? null;
  }
  if ('startDate' in updates) payload.start_date = updates.startDate;
  if ('endDate' in updates) payload.end_date = updates.endDate;
  if ('statusId' in updates) payload.status_id = updates.statusId;
  if ('typeId' in updates) payload.type_id = updates.typeId;
  if ('priority' in updates) payload.priority = updates.priority;
  if ('tagIds' in updates) payload.tag_ids = updates.tagIds;
  if ('description' in updates) payload.description = updates.description;
  if ('repeatId' in updates) payload.repeat_id = updates.repeatId;
  return payload;
};
