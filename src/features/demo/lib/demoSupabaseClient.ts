// Lightweight in-browser stand-in for the Supabase JS client. Exposes
// just enough of the surface (`from(...).chain.then`, `rpc`, `auth.*`,
// `channel`, `functions`) to make the existing planner / dashboard /
// projects / members code paths work against demoDataStore.
//
// Anything the app calls that we haven't wired up returns a benign
// `{ data: null, error: null }` (or no-op) — better silence than
// crashing the demo. Network / realtime are deliberately no-ops:
// demo is single-user and ephemeral.

import type {
  AuthChangeEvent,
  RealtimeChannel,
  Session,
  Subscription,
  User,
} from '@supabase/supabase-js';
import { demoStore } from './demoDataStore';

type Row = Record<string, unknown>;
type Result<T = unknown> = { data: T | null; error: { message: string; code?: string } | null };

const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = (message: string, code?: string): Result => ({ data: null, error: { message, code } });

const cloneRow = <T extends Row>(row: T): T => JSON.parse(JSON.stringify(row));

// PostgREST-style embedded selects (`workspace_members.select('..., workspaces(...)')`)
// resolved manually — the mock doesn't do joins. Maps the embed name (the
// foreign table) to the local FK on the base row and the foreign PK it points
// at. Covers every embed the app currently issues: workspace_members →
// workspaces (via workspace_id) and → profiles (via user_id).
const EMBED_RELATIONS: Record<string, { table: string; localKey: string; foreignKey: string }> = {
  workspaces: { table: 'workspaces', localKey: 'workspace_id', foreignKey: 'id' },
  profiles: { table: 'profiles', localKey: 'user_id', foreignKey: 'id' },
};

const parseEmbedNames = (columns: string): string[] => {
  const names: string[] = [];
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(columns)) !== null) {
    const name = match[1];
    if (EMBED_RELATIONS[name] && !names.includes(name)) names.push(name);
  }
  return names;
};

const matchesValue = (cell: unknown, value: unknown): boolean => {
  if (Array.isArray(cell)) {
    return cell.includes(value);
  }
  return cell === value;
};

interface FilterOp {
  type: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'like' | 'ilike' | 'contains' | 'or';
  column?: string;
  value?: unknown;
  values?: unknown[];
  expr?: string;
}

interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

const compare = (a: unknown, b: unknown): number => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

const applyFilters = (rows: Row[], filters: FilterOp[]): Row[] => {
  return rows.filter((row) => filters.every((f) => {
    if (f.type === 'or') return true; // unsupported — keep row
    const cell = row[f.column ?? ''];
    switch (f.type) {
      case 'eq': return matchesValue(cell, f.value);
      case 'neq': return !matchesValue(cell, f.value);
      case 'gt': return compare(cell, f.value) > 0;
      case 'gte': return compare(cell, f.value) >= 0;
      case 'lt': return compare(cell, f.value) < 0;
      case 'lte': return compare(cell, f.value) <= 0;
      case 'in': return Array.isArray(f.values) && f.values.includes(cell);
      case 'is': return cell === f.value;
      case 'like':
      case 'ilike': {
        const pattern = String(f.value ?? '').replace(/%/g, '.*').replace(/_/g, '.');
        const flags = f.type === 'ilike' ? 'i' : '';
        return new RegExp(`^${pattern}$`, flags).test(String(cell ?? ''));
      }
      case 'contains':
        if (Array.isArray(cell) && Array.isArray(f.value)) {
          return f.value.every((v) => cell.includes(v));
        }
        return false;
      default:
        return true;
    }
  }));
};

class QueryBuilder<T = Row> {
  constructor(
    private readonly tableName: string,
    private readonly op: 'select' | 'insert' | 'update' | 'delete' | 'upsert',
    private readonly payload?: Row | Row[],
  ) {}

  private filters: FilterOp[] = [];
  private orderSpecs: OrderSpec[] = [];
  private limitVal: number | null = null;
  private rangeVal: { from: number; to: number } | null = null;
  private singleMode: 'one' | 'maybe' | null = null;
  private columnsVal = '*';
  private throwOnErrorFlag = false;

  select(columns?: string): this {
    if (columns) this.columnsVal = columns;
    return this;
  }
  eq(column: string, value: unknown): this { this.filters.push({ type: 'eq', column, value }); return this; }
  neq(column: string, value: unknown): this { this.filters.push({ type: 'neq', column, value }); return this; }
  gt(column: string, value: unknown): this { this.filters.push({ type: 'gt', column, value }); return this; }
  gte(column: string, value: unknown): this { this.filters.push({ type: 'gte', column, value }); return this; }
  lt(column: string, value: unknown): this { this.filters.push({ type: 'lt', column, value }); return this; }
  lte(column: string, value: unknown): this { this.filters.push({ type: 'lte', column, value }); return this; }
  in(column: string, values: unknown[]): this { this.filters.push({ type: 'in', column, values }); return this; }
  is(column: string, value: unknown): this { this.filters.push({ type: 'is', column, value }); return this; }
  like(column: string, value: string): this { this.filters.push({ type: 'like', column, value }); return this; }
  ilike(column: string, value: string): this { this.filters.push({ type: 'ilike', column, value }); return this; }
  contains(column: string, value: unknown): this { this.filters.push({ type: 'contains', column, value }); return this; }
  not(column: string, _op: string, value: unknown): this {
    // Frontend rarely uses .not() — treat as neq for known cases.
    this.filters.push({ type: 'neq', column, value });
    return this;
  }
  or(_expr: string): this { this.filters.push({ type: 'or' }); return this; }
  filter(column: string, op: string, value: unknown): this {
    const known = ['eq','neq','gt','gte','lt','lte','in','is','like','ilike','contains'] as const;
    if ((known as readonly string[]).includes(op)) {
      this.filters.push({ type: op as FilterOp['type'], column, value });
    }
    return this;
  }
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderSpecs.push({ column, ascending: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number): this { this.limitVal = n; return this; }
  range(from: number, to: number): this { this.rangeVal = { from, to }; return this; }
  single(): this { this.singleMode = 'one'; return this; }
  maybeSingle(): this { this.singleMode = 'maybe'; return this; }
  throwOnError(): this { this.throwOnErrorFlag = true; return this; }
  csv(): this { return this; }

  // Awaiting the builder triggers execution.
  then<TFulfilled = Result<T>, TRejected = never>(
    onFulfilled?: (value: Result<T>) => TFulfilled | PromiseLike<TFulfilled>,
    onRejected?: (reason: unknown) => TRejected | PromiseLike<TRejected>,
  ): Promise<TFulfilled | TRejected> {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  private execute(): Result<T> {
    const tbl = demoStore.table(this.tableName);

    let result: Row[] = [];

    if (this.op === 'select') {
      result = applyFilters(tbl, this.filters).map(cloneRow);
      const embeds = parseEmbedNames(this.columnsVal);
      if (embeds.length > 0) {
        result = result.map((row) => {
          const next: Row = { ...row };
          for (const name of embeds) {
            const rel = EMBED_RELATIONS[name];
            const localVal = row[rel.localKey];
            const match = demoStore.table(rel.table).find((fr) => fr[rel.foreignKey] === localVal);
            next[name] = match ? cloneRow(match) : null;
          }
          return next;
        });
      }
    } else if (this.op === 'insert' || this.op === 'upsert') {
      const incoming = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
      const inserted: Row[] = [];
      const nowIso = new Date().toISOString();
      incoming.forEach((row) => {
        const next: Row = { ...row };
        if (!('id' in next) || next.id == null) {
          next.id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : `demo-${Math.random().toString(36).slice(2)}`;
        }
        if (!('created_at' in next)) next.created_at = nowIso;
        if (this.tableName === 'tasks' || this.tableName === 'milestones') next.updated_at = nowIso;
        tbl.push(next);
        inserted.push(cloneRow(next));
      });
      demoStore.touch();
      result = inserted;
    } else if (this.op === 'update') {
      const matching = applyFilters(tbl, this.filters);
      const patch = (this.payload ?? {}) as Row;
      const nowIso = new Date().toISOString();
      matching.forEach((row) => {
        Object.assign(row, patch);
        if (this.tableName === 'tasks' || this.tableName === 'milestones') row.updated_at = nowIso;
      });
      demoStore.touch();
      result = matching.map(cloneRow);
    } else if (this.op === 'delete') {
      const matching = applyFilters(tbl, this.filters);
      const ids = new Set(matching.map((r) => r.id));
      const remaining = tbl.filter((r) => !ids.has(r.id));
      tbl.length = 0;
      tbl.push(...remaining);
      demoStore.touch();
      result = matching.map(cloneRow);
    }

    if (this.orderSpecs.length > 0) {
      result.sort((a, b) => {
        for (const spec of this.orderSpecs) {
          const cmp = compare(a[spec.column], b[spec.column]) * (spec.ascending ? 1 : -1);
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }
    if (this.rangeVal) {
      result = result.slice(this.rangeVal.from, this.rangeVal.to + 1);
    }
    if (this.limitVal != null) {
      result = result.slice(0, this.limitVal);
    }

    if (this.singleMode === 'one') {
      if (result.length !== 1) {
        return fail(`Expected single row, got ${result.length}`, 'PGRST116') as Result<T>;
      }
      return ok(result[0]) as Result<T>;
    }
    if (this.singleMode === 'maybe') {
      return ok(result[0] ?? null) as Result<T>;
    }
    return ok(result as unknown as T);
  }
}

// ── auth mock ──────────────────────────────────────────────────────────
const buildSession = (): Session => {
  const user = demoStore.user();
  const expiresIn = 60 * 60 * 24;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  return {
    access_token: 'demo-access-token',
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: expiresAt,
    refresh_token: 'demo-refresh-token',
    user: {
      id: user.id,
      app_metadata: { provider: 'demo' },
      user_metadata: { display_name: user.display_name },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: user.email,
      role: 'authenticated',
      is_anonymous: true,
    } as unknown as User,
  } as Session;
};

const authListeners = new Set<(event: AuthChangeEvent, session: Session | null) => void>();

const notifyAuth = (event: AuthChangeEvent, session: Session | null): void => {
  authListeners.forEach((cb) => cb(event, session));
};

const auth = {
  async getSession() { return ok({ session: buildSession() }); },
  async getUser() { return ok({ user: buildSession().user }); },
  async signInAnonymously() {
    const session = buildSession();
    Promise.resolve().then(() => notifyAuth('SIGNED_IN', session));
    return ok({ session, user: session.user });
  },
  async signOut() {
    Promise.resolve().then(() => notifyAuth('SIGNED_OUT', null));
    return ok(null);
  },
  async signUp() { return fail('Sign up is disabled on the demo sandbox.'); },
  async signInWithPassword() { return fail('Sign in is disabled on the demo sandbox.'); },
  async signInWithOAuth() { return fail('Sign in is disabled on the demo sandbox.'); },
  async resetPasswordForEmail() { return fail('Password reset is disabled on the demo sandbox.'); },
  async updateUser() { return fail('Profile updates are disabled on the demo sandbox.'); },
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): { data: { subscription: Subscription } } {
    authListeners.add(callback);
    // Surface the seeded session right away so AuthProvider can hydrate
    // without waiting for an explicit signInAnonymously.
    Promise.resolve().then(() => callback('INITIAL_SESSION', buildSession()));
    const subscription: Subscription = {
      id: `demo-sub-${Math.random().toString(36).slice(2)}`,
      callback,
      unsubscribe: () => { authListeners.delete(callback); },
    };
    return { data: { subscription } };
  },
};

// ── realtime / channels — no-op stubs ──────────────────────────────────
const channel = (_name: string): RealtimeChannel => {
  const stub: Partial<RealtimeChannel> = {
    on: () => stub as RealtimeChannel,
    subscribe: ((cb?: (status: string) => void) => {
      Promise.resolve().then(() => cb?.('SUBSCRIBED'));
      return stub as RealtimeChannel;
    }) as RealtimeChannel['subscribe'],
    unsubscribe: () => Promise.resolve('ok' as const),
  };
  return stub as RealtimeChannel;
};

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

const asStr = (v: unknown): string | null => (typeof v === 'string' ? v : null);

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

const scopedTasks = (workspaceId: string, start: string, end: string): TaskRow[] => (
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
const dashboardTaskCounts = (args: Record<string, unknown>): StatsRow[] => {
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
const dashboardTaskCountsBase = (args: Record<string, unknown>): StatsRow[] => {
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
const dashboardTaskTimeSeries = (args: Record<string, unknown>): SeriesRow[] => {
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
const dashboardTaskTimeSeriesBase = (args: Record<string, unknown>): SeriesRow[] => {
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
const workspaceWorkloadHeatmap = (args: Record<string, unknown>): Array<{ bucket_date: string; task_count: number }> => {
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
const assigneeUniqueTaskCounts = (args: Record<string, unknown>): Array<{ assignee_id: string; total: number }> => {
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

// ── rpc dispatcher ─────────────────────────────────────────────────────
const rpcHandlers: Record<string, (args: Record<string, unknown>) => Result> = {
  ensure_initial_workspace: () => ok(demoStore.workspaceId()),
  seed_demo_workspace: () => ok(demoStore.workspaceId()),
  reset_demo_workspace: () => {
    demoStore.reset();
    return ok(demoStore.workspaceId());
  },
  demo_heartbeat: () => ok(null),
  // Daily-brief easter egg — no eggs in the demo sandbox (the brief itself is
  // suppressed on /demo anyway); return null instead of warning.
  get_my_daily_brief_egg: () => ok(null),
  // Dashboard aggregates — computed from the seeded tasks so the demo
  // dashboard shows real KPIs, bars, pies and trend lines (mirrors the
  // migration-0055 SQL client-side).
  dashboard_task_counts: (args) => ok(dashboardTaskCounts(args)),
  dashboard_task_counts_base: (args) => ok(dashboardTaskCountsBase(args)),
  dashboard_task_time_series: (args) => ok(dashboardTaskTimeSeries(args)),
  dashboard_task_time_series_base: (args) => ok(dashboardTaskTimeSeriesBase(args)),
  assignee_unique_task_counts: (args) => ok(assigneeUniqueTaskCounts(args)),
  // Workload heatmap board — per-day task density (migration 0102).
  workspace_workload_heatmap: (args) => ok(workspaceWorkloadHeatmap(args)),
  // Account / admin — should never fire on demo (UI is hidden), but
  // return a clear error if they somehow do.
  request_data_export: () => fail('Disabled on demo'),
  request_account_deletion: () => fail('Disabled on demo'),
  preview_account_deletion: () => fail('Disabled on demo'),
  cancel_account_deletion: () => fail('Disabled on demo'),
  rename_purged_profile: () => fail('Disabled on demo'),
  admin_force_purge_account: () => fail('Disabled on demo'),
  create_workspace: () => fail('Disabled on demo'),
  delete_workspace: () => fail('Disabled on demo'),
};

const rpc = (name: string, args: Record<string, unknown> = {}) => {
  const handler = rpcHandlers[name];
  const exec = handler ? handler(args) : (console.warn(`[demo] unhandled rpc(${name})`), ok(null));
  return Promise.resolve(exec);
};

// ── functions.invoke — Edge Functions are out of scope for demo ────────
const functions = {
  async invoke(_name: string, _opts?: unknown) {
    return fail('Edge Functions are not available in the demo sandbox.');
  },
};

// ── storage — same: not used by demo flow, return graceful failure ─────
const storage = {
  from(_bucket: string) {
    return {
      async upload() { return fail('Storage is not available on demo.'); },
      async download() { return fail('Storage is not available on demo.'); },
      async remove() { return fail('Storage is not available on demo.'); },
      async list() { return ok([]); },
      async createSignedUrl() { return fail('Storage is not available on demo.'); },
      getPublicUrl(_path: string) { return { data: { publicUrl: '' } }; },
    };
  },
};

export const demoSupabaseClient = {
  from<T extends Row = Row>(table: string) {
    return new QueryBuilder<T[]>(table, 'select') as unknown as {
      select: (cols?: string) => QueryBuilder<T[]>;
      insert: (rows: Row | Row[]) => QueryBuilder<T[]>;
      update: (patch: Row) => QueryBuilder<T[]>;
      upsert: (rows: Row | Row[]) => QueryBuilder<T[]>;
      delete: () => QueryBuilder<T[]>;
    };
  },
  rpc,
  auth,
  channel,
  removeChannel: (_ch: RealtimeChannel) => Promise.resolve('ok' as const),
  functions,
  storage,
};

// ── Wrapping to make from() return real chains ─────────────────────────
// QueryBuilder needs a separate constructor per op, so we override
// from() to return a small dispatcher object instead of a single builder.
const realFrom = function from<T extends Row = Row>(table: string) {
  return {
    select: (cols?: string) => new QueryBuilder<T[]>(table, 'select').select(cols ?? '*'),
    insert: (rows: Row | Row[]) => new QueryBuilder<T[]>(table, 'insert', rows),
    update: (patch: Row) => new QueryBuilder<T[]>(table, 'update', patch),
    upsert: (rows: Row | Row[]) => new QueryBuilder<T[]>(table, 'upsert', rows),
    delete: () => new QueryBuilder<T[]>(table, 'delete'),
  };
};

(demoSupabaseClient as unknown as { from: typeof realFrom }).from = realFrom;

export type DemoSupabaseClient = typeof demoSupabaseClient;
