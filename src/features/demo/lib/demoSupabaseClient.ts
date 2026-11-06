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
import { INVITE_ACTIONS } from '@/shared/contracts/actions';
import { demoStore } from './demoDataStore';

import { cloneRow, fail, ok, type Result, type Row } from './demoClientCore';
import { QueryBuilder } from './demoQueryBuilder';
import { searchDemoTasks } from './demoTaskSearch';
import {
  asStr,
  assigneeUniqueTaskCounts,
  dashboardTaskCounts,
  dashboardTaskCountsBase,
  dashboardTaskTimeSeries,
  dashboardTaskTimeSeriesBase,
  scopedTasks,
  workspaceWorkloadHeatmap,
} from './demoAggregates';

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

// ── rpc dispatcher ─────────────────────────────────────────────────────
const rpcHandlers: Record<string, (args: Record<string, unknown>) => Result> = {
  ensure_initial_workspace: () => ok(demoStore.workspaceId()),
  seed_demo_workspace: () => ok(demoStore.workspaceId()),
  reset_demo_workspace: () => {
    demoStore.reset();
    return ok(demoStore.workspaceId());
  },
  demo_heartbeat: () => ok(null),
  search_workspace_tasks: (args) => ok(searchDemoTasks(
    asStr(args.p_workspace_id) ?? '',
    asStr(args.p_query) ?? '',
  )),
  // Daily-brief easter egg — no eggs in the demo sandbox (the brief itself is
  // suppressed on /demo anyway); return null instead of warning.
  get_my_daily_brief_egg: () => ok(null),
  // Announcements are an admin's channel to real users; the sandbox has none.
  get_my_announcements: () => ok([]),
  dismiss_announcement: () => ok(null),
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
  // Person colour (migration 0135). The permission check the real function does
  // is pointless here: the demo visitor is the workspace admin by construction.
  set_assignee_color: (args) => {
    const assigneeId = args.p_assignee_id as string;
    const color = (args.p_color ?? null) as string | null;
    if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) return fail('Colour must be #rrggbb');
    const row = demoStore.table('assignees').find((item) => item.id === assigneeId);
    if (!row) return fail('Assignee does not exist');
    row.color = color;
    demoStore.touch();
    return ok(null);
  },
  // Comment badges of the loaded window (migration 0167), from the sandbox's comments.
  task_comment_counts_in_window: (args) => {
    const taskIds = new Set(scopedTasks(
      asStr(args.p_workspace_id) ?? '',
      asStr(args.p_start_date) ?? '',
      asStr(args.p_end_date) ?? '',
    ).map((task) => task.id));
    const counts = new Map<string, number>();
    for (const comment of demoStore.table('task_comments')) {
      const taskId = asStr(comment.task_id);
      if (!taskId || comment.deleted_at != null || !taskIds.has(taskId)) continue;
      counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
    }
    return ok([...counts].map(([task_id, comment_count]) => ({ task_id, comment_count })));
  },
  // The bell (migration 0166): the sandbox has no invites or notifications.
  inbox_list: () => ok({ invites: [], notifications: [], sentInvites: [] }),
  // Series move (migration 0164): apply the client-computed dates to the
  // series rows and return them, like the real function.
  shift_repeat_series: (args) => {
    const repeatId = asStr(args.p_repeat_id);
    const rows = Array.isArray(args.p_rows) ? args.p_rows as Array<{ id?: unknown; start_date?: unknown; end_date?: unknown }> : [];
    const now = new Date().toISOString();
    const moved = rows.flatMap((item) => {
      const task = demoStore.table('tasks').find((row) => row.id === item.id && row.repeat_id === repeatId);
      if (!task || typeof item.start_date !== 'string' || typeof item.end_date !== 'string') return [];
      task.start_date = item.start_date;
      task.end_date = item.end_date;
      task.updated_at = now;
      return [cloneRow(task)];
    });
    demoStore.touch();
    return ok(moved);
  },
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
// Lists a screen loads on open answer "nothing there": the sandbox never sends
// or receives an invite, and an error banner over an empty list reads as a
// broken app. Everything else still fails.
const emptyFunctionReads: Record<string, Partial<Record<string, Row>>> = {
  invite: {
    [INVITE_ACTIONS.LIST]: { invites: [] },
    [INVITE_ACTIONS.LIST_SENT]: { invites: [] },
  },
};

const functions = {
  async invoke(name: string, opts?: { body?: { action?: unknown } }) {
    const action = opts?.body?.action;
    const empty = typeof action === 'string' ? emptyFunctionReads[name]?.[action] : undefined;
    if (empty) return ok(cloneRow(empty));
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

