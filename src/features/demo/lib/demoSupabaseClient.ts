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

// ── rpc dispatcher ─────────────────────────────────────────────────────
const rpcHandlers: Record<string, (args: Record<string, unknown>) => Result> = {
  ensure_initial_workspace: () => ok(demoStore.workspaceId()),
  seed_demo_workspace: () => ok(demoStore.workspaceId()),
  reset_demo_workspace: () => {
    demoStore.reset();
    return ok(demoStore.workspaceId());
  },
  demo_heartbeat: () => ok(null),
  // Dashboard aggregates — return empty stubs so the dashboard renders
  // without crashing. Demo-quality data here is not the priority; the
  // planner timeline is.
  dashboard_task_counts: () => ok([]),
  dashboard_task_counts_base: () => ok([]),
  dashboard_task_time_series: () => ok([]),
  dashboard_task_time_series_base: () => ok([]),
  assignee_unique_task_counts: () => ok([]),
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
