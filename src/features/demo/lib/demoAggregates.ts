import { demoStore } from './demoDataStore';
import type { Row } from './demoClientCore';

// ── dashboard / heatmap aggregates ─────────────────────────────────────
// Client-side reimplementations of the SECURITY DEFINER SQL functions
// (migrations 0055 / 0102 / 0036). They read straight from demoDataStore and
// reproduce the same grouping so the demo dashboard and heatmap render real
// numbers off the seeded tasks. Dates are 'YYYY-MM-DD' strings — lexical
// comparison matches date ordering.

type TaskRow = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  type_id: string | null;
  status_id: string;
  assignee_id: string | null;
  assignee_ids: string[] | null;
  repeat_id: string | null;
  start_date: string;
  end_date: string;
};

export const asStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// A task overlaps [start, end] when start_date <= end AND end_date >= start.
const taskOverlaps = (task: TaskRow, start: string, end: string): boolean => (
  typeof task.start_date === 'string'
  && typeof task.end_date === 'string'
  && task.start_date <= end
  && task.end_date >= start
);

// Mirrors the SQL: assignee_ids if non-empty, else [assignee_id] if set, else [null].
const expandAssignees = (task: TaskRow): (string | null)[] => {
  if (Array.isArray(task.assignee_ids) && task.assignee_ids.length > 0) return task.assignee_ids;
  if (task.assignee_id != null) return [task.assignee_id];
  return [null];
};

const eachDate = (start: string, end: string): string[] => {
  const out: string[] = [];
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return out;
  for (let ms = startMs; ms <= endMs; ms += 86_400_000) {
    out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return out;
};

type Lookups = {
  projects: Map<string, Row>;
  taskTypes: Map<string, Row>;
  statuses: Map<string, Row>;
  assignees: Map<string, Row>;
};

const buildLookups = (): Lookups => ({
  projects: new Map(demoStore.table('projects').map((r) => [r.id as string, r])),
  taskTypes: new Map(demoStore.table('task_types').map((r) => [r.id as string, r])),
  statuses: new Map(demoStore.table('statuses').map((r) => [r.id as string, r])),
  assignees: new Map(demoStore.table('assignees').map((r) => [r.id as string, r])),
});

// coalesce(is_active, true): an unknown or field-less assignee reads as active.
const isAssigneeActive = (assignees: Map<string, Row>, id: string | null): boolean => {
  if (id == null) return true;
  const row = assignees.get(id);
  if (!row) return true;
  return (row.is_active as boolean | undefined) ?? true;
};

export const scopedTasks = (workspaceId: string, start: string, end: string): TaskRow[] => (
  (demoStore.table('tasks') as unknown as TaskRow[])
    .filter((t) => t.workspace_id === workspaceId && taskOverlaps(t, start, end))
);

type StatsRow = {
  assignee_id: string | null;
  assignee_name: string | null;
  project_id: string | null;
  project_name: string | null;
  task_type_id: string | null;
  task_type_name: string | null;
  status_id: string;
  status_name: string;
  status_is_final: boolean;
  total: number;
};

const baseGroupFields = (task: TaskRow, lk: Lookups) => {
  const status = lk.statuses.get(task.status_id);
  const project = task.project_id ? lk.projects.get(task.project_id) ?? null : null;
  const type = task.type_id ? lk.taskTypes.get(task.type_id) ?? null : null;
  return { status, project, type };
};

// dashboard_task_counts: one row per (assignee × project × task_type × status),
// total = count(task) — a task with N assignees contributes to N groups.
export const dashboardTaskCounts = (args: Record<string, unknown>): StatsRow[] => {
  const lk = buildLookups();
  const includeDisabled = Boolean(args.p_include_disabled_assignees);
  const tasks = scopedTasks(asStr(args.p_workspace_id) ?? '', asStr(args.p_start_date) ?? '', asStr(args.p_end_date) ?? '');
  const groups = new Map<string, StatsRow>();
  for (const task of tasks) {
    const { status, project, type } = baseGroupFields(task, lk);
    if (!status) continue; // inner join on statuses
    for (const aid of expandAssignees(task)) {
      if (!(includeDisabled || aid == null || isAssigneeActive(lk.assignees, aid))) continue;
      const assignee = aid != null ? lk.assignees.get(aid) ?? null : null;
      const key = `${aid ?? ''}|${task.project_id ?? ''}|${task.type_id ?? ''}|${task.status_id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          assignee_id: aid ?? null,
          assignee_name: assignee ? (assignee.name as string) : null,
          project_id: task.project_id ?? null,
          project_name: project ? (project.name as string) : null,
          task_type_id: task.type_id ?? null,
          task_type_name: type ? (type.name as string) : null,
          status_id: status.id as string,
          status_name: status.name as string,
          status_is_final: Boolean(status.is_final),
          total: 0,
        };
        groups.set(key, g);
      }
      g.total += 1;
    }
  }
  return [...groups.values()];
};

// A task passes the active filter if disabled are included, it has no
// assignees at all, or at least one assignee is active.
const taskPassesActiveFilter = (task: TaskRow, assignees: Map<string, Row>, includeDisabled: boolean): boolean => {
  if (includeDisabled) return true;
  const list = Array.isArray(task.assignee_ids) && task.assignee_ids.length > 0
    ? task.assignee_ids
    : (task.assignee_id != null ? [task.assignee_id] : []);
  if (list.length === 0) return true;
  return list.some((id) => id != null && isAssigneeActive(assignees, id));
};

// dashboard_task_counts_base: deduped — count(distinct task) per (project ×
// task_type × status); assignee columns always null.
export const dashboardTaskCountsBase = (args: Record<string, unknown>): StatsRow[] => {
  const lk = buildLookups();
  const includeDisabled = Boolean(args.p_include_disabled_assignees);
  const tasks = scopedTasks(asStr(args.p_workspace_id) ?? '', asStr(args.p_start_date) ?? '', asStr(args.p_end_date) ?? '')
    .filter((t) => taskPassesActiveFilter(t, lk.assignees, includeDisabled));
  const groups = new Map<string, StatsRow & { ids: Set<string> }>();
  for (const task of tasks) {
    const { status, project, type } = baseGroupFields(task, lk);
    if (!status) continue;
    const key = `${task.project_id ?? ''}|${task.type_id ?? ''}|${task.status_id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        assignee_id: null,
        assignee_name: null,
        project_id: task.project_id ?? null,
        project_name: project ? (project.name as string) : null,
        task_type_id: task.type_id ?? null,
        task_type_name: type ? (type.name as string) : null,
        status_id: status.id as string,
        status_name: status.name as string,
        status_is_final: Boolean(status.is_final),
        total: 0,
        ids: new Set<string>(),
      };
      groups.set(key, g);
    }
    g.ids.add(task.id);
  }
  return [...groups.values()].map(({ ids, ...g }) => ({ ...g, total: ids.size }));
};

type SeriesRow = StatsRow & { bucket_date: string };

// dashboard_task_time_series: per-day version of dashboard_task_counts.
export const dashboardTaskTimeSeries = (args: Record<string, unknown>): SeriesRow[] => {
  const lk = buildLookups();
  const includeDisabled = Boolean(args.p_include_disabled_assignees);
  const workspaceId = asStr(args.p_workspace_id) ?? '';
  const start = asStr(args.p_start_date) ?? '';
  const end = asStr(args.p_end_date) ?? '';
  const tasks = (demoStore.table('tasks') as unknown as TaskRow[]).filter((t) => t.workspace_id === workspaceId);
  const groups = new Map<string, SeriesRow>();
  for (const day of eachDate(start, end)) {
    for (const task of tasks) {
      if (!taskOverlaps(task, day, day)) continue;
      const { status, project, type } = baseGroupFields(task, lk);
      if (!status) continue;
      for (const aid of expandAssignees(task)) {
        if (!(includeDisabled || aid == null || isAssigneeActive(lk.assignees, aid))) continue;
        const assignee = aid != null ? lk.assignees.get(aid) ?? null : null;
        const key = `${day}|${aid ?? ''}|${task.project_id ?? ''}|${task.type_id ?? ''}|${task.status_id}`;
        let g = groups.get(key);
        if (!g) {
          g = {
            bucket_date: day,
            assignee_id: aid ?? null,
            assignee_name: assignee ? (assignee.name as string) : null,
            project_id: task.project_id ?? null,
            project_name: project ? (project.name as string) : null,
            task_type_id: task.type_id ?? null,
            task_type_name: type ? (type.name as string) : null,
            status_id: status.id as string,
            status_name: status.name as string,
            status_is_final: Boolean(status.is_final),
            total: 0,
          };
          groups.set(key, g);
        }
        g.total += 1;
      }
    }
  }
  return [...groups.values()];
};

// dashboard_task_time_series_base: per-day deduped counts, assignee null.
export const dashboardTaskTimeSeriesBase = (args: Record<string, unknown>): SeriesRow[] => {
  const lk = buildLookups();
  const includeDisabled = Boolean(args.p_include_disabled_assignees);
  const workspaceId = asStr(args.p_workspace_id) ?? '';
  const start = asStr(args.p_start_date) ?? '';
  const end = asStr(args.p_end_date) ?? '';
  const tasks = (demoStore.table('tasks') as unknown as TaskRow[]).filter((t) => t.workspace_id === workspaceId);
  const groups = new Map<string, SeriesRow & { ids: Set<string> }>();
  for (const day of eachDate(start, end)) {
    for (const task of tasks) {
      if (!taskOverlaps(task, day, day)) continue;
      if (!taskPassesActiveFilter(task, lk.assignees, includeDisabled)) continue;
      const { status, project, type } = baseGroupFields(task, lk);
      if (!status) continue;
      const key = `${day}|${task.project_id ?? ''}|${task.type_id ?? ''}|${task.status_id}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          bucket_date: day,
          assignee_id: null,
          assignee_name: null,
          project_id: task.project_id ?? null,
          project_name: project ? (project.name as string) : null,
          task_type_id: task.type_id ?? null,
          task_type_name: type ? (type.name as string) : null,
          status_id: status.id as string,
          status_name: status.name as string,
          status_is_final: Boolean(status.is_final),
          total: 0,
          ids: new Set<string>(),
        };
        groups.set(key, g);
      }
      g.ids.add(task.id);
    }
  }
  return [...groups.values()].map(({ ids, ...g }) => ({ ...g, total: ids.size }));
};

// workspace_workload_heatmap: count(distinct task) overlapping each day.
export const workspaceWorkloadHeatmap = (args: Record<string, unknown>): Array<{ bucket_date: string; task_count: number }> => {
  const workspaceId = asStr(args.p_workspace_id) ?? '';
  const start = asStr(args.p_start_date) ?? '';
  const end = asStr(args.p_end_date) ?? '';
  const tasks = (demoStore.table('tasks') as unknown as TaskRow[]).filter((t) => t.workspace_id === workspaceId);
  return eachDate(start, end).map((day) => ({
    bucket_date: day,
    task_count: tasks.reduce((sum, task) => sum + (taskOverlaps(task, day, day) ? 1 : 0), 0),
  }));
};

// assignee_unique_task_counts: distinct (repeat series | task) per assignee.
export const assigneeUniqueTaskCounts = (args: Record<string, unknown>): Array<{ assignee_id: string; total: number }> => {
  const tasks = scopedTasks(asStr(args.p_workspace_id) ?? '', asStr(args.p_start_date) ?? '', asStr(args.p_end_date) ?? '');
  const byAssignee = new Map<string, Set<string>>();
  for (const task of tasks) {
    const list = Array.isArray(task.assignee_ids) && task.assignee_ids.length > 0
      ? task.assignee_ids
      : (task.assignee_id != null ? [task.assignee_id] : []);
    const unit = task.repeat_id != null ? String(task.repeat_id) : `t:${task.id}`;
    for (const aid of list) {
      if (aid == null) continue;
      let set = byAssignee.get(aid);
      if (!set) { set = new Set(); byAssignee.set(aid, set); }
      set.add(unit);
    }
  }
  return [...byAssignee.entries()].map(([assignee_id, set]) => ({ assignee_id, total: set.size }));
};
