import { Task } from '@/features/planner/types/planner';

export type TaskMappedRow = {
  id: string;
  title: string;
  project_id: string | null;
  assignee_id: string | null;
  assignee_ids: string[] | null;
  start_date: string;
  end_date: string;
  status_id: string;
  type_id: string;
  priority: string | null;
  tag_ids: string[] | null;
  description: string | null | undefined;
  repeat_id: string | null;
  repeat_ends?: string | null;
  created_at?: string;
  updated_at?: string;
};

const REPEAT_ENDS_VALUES: ReadonlySet<string> = new Set(['never', 'on', 'after']);

/** Coerce a raw DB value to a known repeat-end mode; anything else reads as null. */
export const normalizeRepeatEnds = (value: unknown): Task['repeatEnds'] => (
  typeof value === 'string' && REPEAT_ENDS_VALUES.has(value)
    ? (value as Task['repeatEnds'])
    : null
);

export const normalizeAssigneeIds = (
  assigneeIds: string[] | null | undefined,
  legacyId: string | null | undefined,
) => {
  const combined = [
    ...(assigneeIds ?? []),
    ...(legacyId ? [legacyId] : []),
  ];
  return Array.from(new Set(combined.filter(Boolean)));
};

export const mapTaskRow = (row: TaskMappedRow): Task => ({
  id: row.id,
  title: row.title,
  projectId: row.project_id,
  assigneeIds: normalizeAssigneeIds(row.assignee_ids, row.assignee_id),
  startDate: row.start_date,
  endDate: row.end_date,
  statusId: row.status_id,
  typeId: row.type_id,
  priority: row.priority as Task['priority'],
  tagIds: row.tag_ids ?? [],
  description: row.description,
  repeatId: row.repeat_id ?? null,
  repeatEnds: normalizeRepeatEnds(row.repeat_ends),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
