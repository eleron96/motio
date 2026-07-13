// Client-side data store for the demo sandbox. Lives in sessionStorage
// so closing the tab wipes everything; a 24h TTL on lastActivityAt
// catches forgotten tabs that someone leaves open for a day or two.
//
// The store backs the supabase mock (demoSupabaseClient.ts). Every
// row is just a plain object — the mock's chained query builder
// reads/writes these arrays directly.

import {
  DEMO_SEED_PROJECTS,
  DEMO_SEED_ASSIGNEES,
  DEMO_SEED_STATUSES,
  DEMO_SEED_TASK_TYPES,
  DEMO_SEED_TAGS,
  DEMO_SEED_TASKS,
  DEMO_SEED_MILESTONES,
  DEMO_SEED_CUSTOMERS,
  DEMO_SEED_CUSTOMER_CONTACTS,
  DEMO_SEED_PROJECT_MEMBERS,
  DEMO_SEED_PROJECT_CUSTOMER,
  DEMO_SEED_DASHBOARDS,
  buildDemoDashboardLayouts,
} from './demoSeed';

const STORAGE_KEY = 'motio.demo.state.v1';
const TTL_MS = 24 * 60 * 60 * 1000;
const DEMO_USER_ID_PREFIX = 'demo-user-';
const DEMO_WORKSPACE_NAME = 'Demo Sandbox';

type Row = Record<string, unknown>;

type Tables = Record<string, Row[]>;

interface PersistedState {
  // Bump when the seed shape changes so returning visitors drop a stale
  // cache and reseed. v2: dashboards/customers/contacts/project members.
  // v3: explicit dashboard grid layouts (v2 shipped with auto-placed
  // layouts that rendered cramped and jittered). v4: drop any v3 cache that
  // may have persisted a jitter-drifted layout before the store no-op guard.
  // v5: dashboards reshaped to mirror prod widget mix (assignee-centric).
  schemaVersion: 5;
  lastActivityAt: number;
  user: { id: string; email: string; display_name: string };
  workspaceId: string;
  tables: Tables;
}

interface DemoStore {
  user: PersistedState['user'];
  workspaceId: string;
  tables: Tables;
  lastActivityAt: number;
}

const newId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for old browsers that won't ever hit prod /demo, but keep
  // typescript happy and unit tests deterministic.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const today = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const addDays = (base: Date, days: number): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  const iso = d.toISOString();
  return iso.slice(0, 10);
};

const buildFreshState = (): DemoStore => {
  const userId = `${DEMO_USER_ID_PREFIX}${newId()}`;
  const workspaceId = newId();
  const nowIso = new Date().toISOString();
  const anchor = today();

  const user = {
    id: userId,
    email: 'demo@motio.local',
    display_name: 'Demo Visitor',
  };

  const tables: Tables = {
    workspaces: [
      {
        id: workspaceId,
        name: DEMO_WORKSPACE_NAME,
        owner_id: userId,
        holiday_country: null,
        // Opt the demo workspace into the workload heatmap board (the env
        // flag is forced on for /demo in featureFlags.ts). Capacity is left
        // to auto-from-history so the gradient adapts to the seeded load.
        heatmap_enabled: true,
        heatmap_capacity_per_person: null,
        created_at: nowIso,
      },
    ],
    workspace_members: [
      {
        workspace_id: workspaceId,
        user_id: userId,
        role: 'admin',
        created_at: nowIso,
      },
    ],
    profiles: [
      {
        id: userId,
        email: user.email,
        display_name: user.display_name,
        locale: null,
        avatar_url: null,
        status: 'ACTIVE',
        purge_after: null,
        preferences: {},
        created_at: nowIso,
      },
    ],
    projects: DEMO_SEED_PROJECTS.map((p) => ({
      id: p.id,
      workspace_id: workspaceId,
      name: p.name,
      color: p.color,
      customer_id: DEMO_SEED_PROJECT_CUSTOMER[p.id] ?? null,
      code: null,
      archived: false,
      archived_at: null,
      status: null,
      owner_group_id: null,
      created_at: nowIso,
    })),
    statuses: DEMO_SEED_STATUSES.map((s) => ({
      id: s.id,
      workspace_id: workspaceId,
      name: s.name,
      color: s.color,
      is_final: s.is_final,
      is_cancelled: s.is_cancelled,
      emoji: null,
      created_at: nowIso,
    })),
    task_types: DEMO_SEED_TASK_TYPES.map((t) => ({
      id: t.id,
      workspace_id: workspaceId,
      name: t.name,
      icon: t.icon,
      created_at: nowIso,
    })),
    tags: DEMO_SEED_TAGS.map((t) => ({
      id: t.id,
      workspace_id: workspaceId,
      name: t.name,
      color: t.color,
      created_at: nowIso,
    })),
    assignees: [
      // synthetic teammates
      ...DEMO_SEED_ASSIGNEES.map((a) => ({
        id: a.id,
        workspace_id: workspaceId,
        user_id: null,
        name: a.name,
        is_active: true,
        email: null,
        phone: null,
        created_at: nowIso,
      })),
      // auto-assignee for the demo visitor themselves
      {
        id: newId(),
        workspace_id: workspaceId,
        user_id: userId,
        name: user.display_name,
        is_active: true,
        email: user.email,
        phone: null,
        created_at: nowIso,
      },
    ],
    tasks: DEMO_SEED_TASKS.map((t) => ({
      id: t.id,
      workspace_id: workspaceId,
      title: t.title,
      project_id: t.project_id,
      assignee_id: t.assignee_ids[0] ?? null,
      assignee_ids: t.assignee_ids,
      start_date: addDays(anchor, t.start_offset_days),
      end_date: addDays(anchor, t.end_offset_days),
      status_id: t.status_id,
      type_id: t.type_id,
      priority: t.priority,
      tag_ids: t.tag_ids,
      description: t.description,
      created_at: nowIso,
      updated_at: nowIso,
    })),
    milestones: DEMO_SEED_MILESTONES.map((m) => ({
      id: m.id,
      workspace_id: workspaceId,
      project_id: m.project_id,
      date: addDays(anchor, m.offset_days),
      title: m.title,
      created_at: nowIso,
      updated_at: nowIso,
    })),
    customers: DEMO_SEED_CUSTOMERS.map((c) => ({
      id: c.id,
      workspace_id: workspaceId,
      name: c.name,
      industry: c.industry,
      created_at: nowIso,
    })),
    customer_contacts: DEMO_SEED_CUSTOMER_CONTACTS.map((c) => ({
      id: c.id,
      workspace_id: workspaceId,
      customer_id: c.customer_id,
      name: c.name,
      role: c.role,
      email: c.email,
      phone: c.phone,
      company: c.company,
      tag: c.tag,
      position: c.position,
      created_at: nowIso,
      updated_at: nowIso,
    })),
    project_members: DEMO_SEED_PROJECT_MEMBERS.map((m) => ({
      id: m.id,
      workspace_id: workspaceId,
      project_id: m.project_id,
      assignee_id: m.assignee_id,
      role: m.role,
      tag: m.tag,
      external_name: m.external_name,
      external_company: m.external_company,
      external_email: m.external_email,
      external_phone: m.external_phone,
      position: m.position,
      created_at: nowIso,
      updated_at: nowIso,
    })),
    workspace_dashboards: DEMO_SEED_DASHBOARDS.map((d) => ({
      id: d.id,
      workspace_id: workspaceId,
      name: d.name,
      widgets: d.widgets,
      layouts: buildDemoDashboardLayouts(d.widgets),
      created_at: nowIso,
      updated_at: nowIso,
    })),
    project_activity: [],
    // Tables read by the app but not seeded — empty arrays prevent
    // "table 'foo' not found" errors in the mock client.
    member_groups: [],
    member_group_assignments: [],
    project_tracking: [],
    user_workspace_templates: [],
    task_subtasks: [],
    task_comments: [],
    super_admins: [],
    user_notifications: [],
    invites: [],
    holidays: [],
    daily_brief_state: [],
    account_deletion_events: [],
    data_export_requests: [],
  };

  return {
    user,
    workspaceId,
    tables,
    lastActivityAt: Date.now(),
  };
};

const isBrowser = typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

const loadPersisted = (): DemoStore | null => {
  if (!isBrowser) return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.schemaVersion !== 5) return null;
    if (Date.now() - parsed.lastActivityAt > TTL_MS) return null;
    return {
      user: parsed.user,
      workspaceId: parsed.workspaceId,
      tables: parsed.tables,
      lastActivityAt: parsed.lastActivityAt,
    };
  } catch {
    return null;
  }
};

const persist = (store: DemoStore): void => {
  if (!isBrowser) return;
  const payload: PersistedState = {
    schemaVersion: 5,
    lastActivityAt: store.lastActivityAt,
    user: store.user,
    workspaceId: store.workspaceId,
    tables: store.tables,
  };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // sessionStorage full or blocked — demo just runs purely in memory.
  }
};

let store: DemoStore | null = null;

export const demoStore = {
  /**
   * Returns the live store, hydrating from sessionStorage if present and
   * still within the TTL window, otherwise reseeding from scratch.
   */
  get(): DemoStore {
    if (store) return store;
    store = loadPersisted() ?? buildFreshState();
    persist(store);
    return store;
  },

  /**
   * Drops the persisted state and starts over with a fresh seed. Used
   * by the "Reset demo" button and by the TTL expiry path.
   */
  reset(): DemoStore {
    store = buildFreshState();
    persist(store);
    return store;
  },

  /**
   * Bumps lastActivityAt and writes through to sessionStorage. Cheap;
   * called on every mutation.
   */
  touch(): void {
    const s = this.get();
    s.lastActivityAt = Date.now();
    persist(s);
  },

  /**
   * Whether the persisted state has expired against the TTL. Computed
   * lazily — callers should invoke this on visibility-change to detect
   * a tab that woke up after >24h.
   */
  isExpired(): boolean {
    if (!isBrowser) return false;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as PersistedState;
      return Date.now() - parsed.lastActivityAt > TTL_MS;
    } catch {
      return true;
    }
  },

  /**
   * Direct access to a table for the supabase mock. Returns the live
   * array reference — mutations on it persist via touch().
   */
  table<T extends Row = Row>(name: string): T[] {
    const s = this.get();
    if (!s.tables[name]) {
      s.tables[name] = [];
    }
    return s.tables[name] as T[];
  },

  user(): DemoStore['user'] {
    return this.get().user;
  },

  workspaceId(): string {
    return this.get().workspaceId;
  },

  /**
   * Wipes the persisted state without reseeding. Used when the visitor
   * leaves the sandbox via the "Exit demo" button so the next visit
   * starts from scratch instead of restoring whatever they last did.
   */
  clear(): void {
    store = null;
    if (isBrowser) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  },

  /**
   * Test-only alias of clear(). Kept for backwards compatibility with
   * the few tests that already call __reset().
   */
  __reset(): void {
    this.clear();
  },
};

export const TTL_HOURS = 24;
