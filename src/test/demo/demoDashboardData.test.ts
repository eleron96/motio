import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { demoSupabaseClient } from '@/features/demo/lib/demoSupabaseClient';
import { demoStore } from '@/features/demo/lib/demoDataStore';
import {
  getPeriodRange,
  buildWidgetData,
  buildTimeSeriesData,
} from '@/features/dashboard/lib/dashboardUtils';
import type { DashboardStatus, DashboardOption, DashboardWidget } from '@/features/dashboard/types/dashboard';
import { buildContactList, buildCompanyBuckets } from '@/features/projects/lib/contactList';
import { DEMO_SEED_DASHBOARDS, buildDemoDashboardLayouts } from '@/features/demo/lib/demoSeed';
import { mapCustomerRow, mapCustomerContactRow, mapProjectMemberRow } from '@/features/planner/store/plannerStore.helpers';
import { isProjectCardEnabled, isWorkloadHeatmapEnabled } from '@/shared/lib/featureFlags';

vi.mock('@lingui/macro', () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, str, idx) => acc + str + (values[idx] ?? ''), ''),
}));

type Row = Record<string, unknown>;

const call = async (name: string, args: Row) => {
  const { data, error } = await demoSupabaseClient.rpc(name, args);
  expect(error).toBeNull();
  return data as unknown as Row[];
};

const statusOptions = (): DashboardStatus[] =>
  demoStore.table('statuses').map((s) => ({
    id: s.id as string,
    name: s.name as string,
    emoji: null,
    color: s.color as string,
    isFinal: Boolean(s.is_final) && !Boolean(s.is_cancelled),
    isCancelled: Boolean(s.is_cancelled),
  }));

const projectOptions = (): DashboardOption[] =>
  demoStore.table('projects').map((p) => ({
    id: p.id as string,
    name: p.name as string,
    code: null,
    color: p.color as string,
  }));

describe('demo dashboard RPC aggregates', () => {
  beforeEach(() => {
    demoStore.__reset();
  });

  it('dashboard_task_counts_base counts every distinct task in the window once', async () => {
    const workspaceId = demoStore.workspaceId();
    const { startDate, endDate } = getPeriodRange('month');
    const rows = await call('dashboard_task_counts_base', {
      p_workspace_id: workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_include_disabled_assignees: false,
    });
    expect(rows.length).toBeGreaterThan(0);

    // Independent count of distinct tasks overlapping the window.
    const tasks = demoStore.table('tasks').filter((t) => (
      (t.start_date as string) <= endDate && (t.end_date as string) >= startDate
    ));
    const sumOfTotals = rows.reduce((acc, r) => acc + (r.total as number), 0);
    expect(sumOfTotals).toBe(tasks.length);
    // assignee columns are always null in the deduped variant
    expect(rows.every((r) => r.assignee_id === null)).toBe(true);
    // shape sanity
    expect(rows.every((r) => typeof r.status_id === 'string' && typeof r.status_name === 'string')).toBe(true);
  });

  it('dashboard_task_counts expands per-assignee (a 2-assignee task counts twice)', async () => {
    const workspaceId = demoStore.workspaceId();
    const { startDate, endDate } = getPeriodRange('month');
    const rows = await call('dashboard_task_counts', {
      p_workspace_id: workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_include_disabled_assignees: false,
    });

    // Independent expected total: sum over overlapping tasks of assignee-unit count.
    const tasks = demoStore.table('tasks').filter((t) => (
      (t.start_date as string) <= endDate && (t.end_date as string) >= startDate
    ));
    const expected = tasks.reduce((acc, t) => {
      const ids = Array.isArray(t.assignee_ids) ? (t.assignee_ids as string[]) : [];
      const units = ids.length > 0 ? ids.length : (t.assignee_id != null ? 1 : 1);
      return acc + units;
    }, 0);
    const sumOfTotals = rows.reduce((acc, r) => acc + (r.total as number), 0);
    expect(sumOfTotals).toBe(expected);
  });

  it('buildWidgetData over base rows yields a non-empty "by status" chart', async () => {
    const workspaceId = demoStore.workspaceId();
    const { startDate, endDate } = getPeriodRange('month');
    const rows = await call('dashboard_task_counts_base', {
      p_workspace_id: workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_include_disabled_assignees: false,
    });
    const widget = {
      id: 'w', type: 'bar', title: 'By status', period: 'month', groupBy: 'status', statusFilter: 'all',
    } as unknown as DashboardWidget;
    const data = buildWidgetData(rows as never, widget, statusOptions(), projectOptions());
    expect(data.total).toBeGreaterThan(0);
    expect(data.series.length).toBeGreaterThan(1); // several statuses present
  });

  it('time series produces one point per day with real totals', async () => {
    const workspaceId = demoStore.workspaceId();
    const { startDate, endDate } = getPeriodRange('month');
    const rows = await call('dashboard_task_time_series', {
      p_workspace_id: workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_include_disabled_assignees: false,
    });
    expect(rows.length).toBeGreaterThan(0);
    const distinctDates = new Set(rows.map((r) => r.bucket_date as string));
    expect(distinctDates.size).toBeGreaterThan(1);

    const widget = {
      id: 'w', type: 'area', title: 'Trend', period: 'month', groupBy: 'status', statusFilter: 'all',
    } as unknown as DashboardWidget;
    const data = buildTimeSeriesData(rows as never, widget, statusOptions(), projectOptions());
    expect(data.total).toBeGreaterThan(0);
    expect((data.timeSeries ?? []).length).toBeGreaterThan(20); // ~1 month of days
  });

  it('active-status KPI counts only non-final tasks', async () => {
    const workspaceId = demoStore.workspaceId();
    const { startDate, endDate } = getPeriodRange('week');
    const rows = await call('dashboard_task_counts_base', {
      p_workspace_id: workspaceId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_include_disabled_assignees: false,
    });
    const widget = {
      id: 'w', type: 'kpi', title: 'Active', period: 'week', groupBy: 'none', statusFilter: 'active',
    } as unknown as DashboardWidget;
    const data = buildWidgetData(rows as never, widget, statusOptions(), projectOptions());
    // Every counted row must be a non-final status.
    const finalIds = new Set(statusOptions().filter((s) => s.isFinal || s.isCancelled).map((s) => s.id));
    const activeRows = (rows as Array<{ status_id: string; total: number }>).filter((r) => !finalIds.has(r.status_id));
    const expected = activeRows.reduce((acc, r) => acc + r.total, 0);
    expect(data.total).toBe(expected);
    expect(data.total).toBeGreaterThan(0);
  });
});

describe('demo workload heatmap', () => {
  beforeEach(() => {
    demoStore.__reset();
  });

  it('returns a per-day count that matches tasks overlapping today', async () => {
    const workspaceId = demoStore.workspaceId();
    const today = new Date().toISOString().slice(0, 10);
    const rows = await call('workspace_workload_heatmap', {
      p_workspace_id: workspaceId,
      p_start_date: today,
      p_end_date: today,
    });
    expect(rows.length).toBe(1);
    const expected = demoStore.table('tasks').filter((t) => (
      (t.start_date as string) <= today && (t.end_date as string) >= today
    )).length;
    expect(rows[0].task_count).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('workspace embed resolves heatmap_enabled=true for the demo workspace', async () => {
    const userId = demoStore.user().id;
    const { data, error } = await demoSupabaseClient
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, holiday_country, heatmap_enabled, heatmap_capacity_per_person, owner_id)')
      .eq('user_id', userId);
    expect(error).toBeNull();
    const row = (data as unknown as Array<{ workspaces: { name: string; heatmap_enabled: boolean } | null }>)[0];
    expect(row.workspaces).not.toBeNull();
    expect(row.workspaces?.heatmap_enabled).toBe(true);
    expect(row.workspaces?.name).toBe('Demo Sandbox');
  });
});

describe('demo clients & contacts', () => {
  beforeEach(() => {
    demoStore.__reset();
  });

  it('seeds customers and links them to projects', async () => {
    const workspaceId = demoStore.workspaceId();
    const { data } = await demoSupabaseClient
      .from('customers')
      .select('id, workspace_id, name, industry')
      .eq('workspace_id', workspaceId);
    const rows = (data as Row[]).map((r) => mapCustomerRow(r as never));
    expect(rows.length).toBe(5);
    expect(rows.every((c) => c.industry)).toBe(true);

    const linkedProjects = demoStore.table('projects').filter((p) => p.customer_id != null);
    expect(linkedProjects.length).toBeGreaterThanOrEqual(5);
  });

  it('builds the Contacts directory with company buckets and cross-project dedup', async () => {
    const workspaceId = demoStore.workspaceId();
    const [customersRes, contactsRes, membersRes] = await Promise.all([
      demoSupabaseClient.from('customers').select('*').eq('workspace_id', workspaceId),
      demoSupabaseClient.from('customer_contacts').select('*').eq('workspace_id', workspaceId),
      demoSupabaseClient.from('project_members').select('*').eq('workspace_id', workspaceId),
    ]);
    const customers = (customersRes.data as Row[]).map((r) => mapCustomerRow(r as never));
    const contacts = (contactsRes.data as Row[]).map((r) => mapCustomerContactRow(r as never));
    const members = (membersRes.data as Row[]).map((r) => mapProjectMemberRow(r as never));
    const customersById = new Map(customers.map((c) => [c.id, c]));

    const entries = buildContactList(contacts, members, customersById);
    expect(entries.length).toBeGreaterThan(0);

    // Sergey Volkov is on two projects but appears once (deduped) with 2 projectIds.
    const sergey = entries.find((e) => e.name === 'Sergey Volkov');
    expect(sergey).toBeDefined();
    expect(sergey?.source.kind).toBe('external');
    if (sergey?.source.kind === 'external') {
      expect(sergey.source.projectIds.length).toBe(2);
    }

    // Company buckets include real client companies and a "no company" bucket.
    const buckets = buildCompanyBuckets(entries);
    const bucketNames = buckets.map((b) => b.company);
    expect(bucketNames).toContain('Northwind Trading');
    expect(bucketNames).toContain('BuildTech LLC');
    expect(bucketNames).toContain(null); // Priya Nair has no company

    // Internal (workspace-assignee) members are excluded from the directory.
    const emmaAsContact = entries.find((e) => e.name === 'Emma Taylor');
    expect(emmaAsContact).toBeUndefined();
  });
});

describe('demo dashboard layouts are stable (no jitter)', () => {
  const COLS: Record<string, number> = { xxl: 16, xl: 14, lg: 12, md: 10, sm: 6, xs: 2 };

  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );

  it('every seeded dashboard has collision-free, in-bounds layouts on all breakpoints', () => {
    for (const dashboard of DEMO_SEED_DASHBOARDS) {
      const layouts = buildDemoDashboardLayouts(dashboard.widgets);
      // one layout per breakpoint, one item per widget
      expect(Object.keys(layouts).sort()).toEqual(Object.keys(COLS).sort());
      for (const [breakpoint, cols] of Object.entries(COLS)) {
        const items = layouts[breakpoint];
        expect(items.length).toBe(dashboard.widgets.length);
        // every item fits inside the column count
        for (const item of items) {
          expect(item.x).toBeGreaterThanOrEqual(0);
          expect(item.w).toBeGreaterThanOrEqual(1);
          expect(item.x + item.w).toBeLessThanOrEqual(cols);
          expect(item.h).toBeGreaterThanOrEqual(1);
        }
        // no two widgets overlap
        for (let i = 0; i < items.length; i += 1) {
          for (let j = i + 1; j < items.length; j += 1) {
            expect(overlaps(items[i], items[j])).toBe(false);
          }
        }
        // every item id maps back to a widget
        const widgetIds = new Set(dashboard.widgets.map((w) => w.id as string));
        expect(items.every((it) => widgetIds.has(it.i))).toBe(true);
      }
    }
  });

  it('KPI widgets get a readable cell (not 1×1) at desktop', () => {
    const withKpi = DEMO_SEED_DASHBOARDS.find((d) => d.widgets.some((w) => w.type === 'kpi'));
    const layouts = buildDemoDashboardLayouts(withKpi!.widgets);
    const kpiIds = new Set(
      withKpi!.widgets.filter((w) => w.type === 'kpi').map((w) => w.id as string),
    );
    const kpiItems = layouts.lg.filter((it) => kpiIds.has(it.i));
    expect(kpiItems.length).toBeGreaterThan(0);
    // a 1×1 KPI is the broken case; require a wider/taller cell
    expect(kpiItems.every((it) => it.w >= 2 && it.h >= 2)).toBe(true);
  });
});

describe('demo feature flags', () => {
  const originalPath = window.location.pathname;
  afterEach(() => {
    window.history.replaceState({}, '', originalPath);
  });

  it('forces project-card and workload-heatmap ON while on /demo', () => {
    window.history.replaceState({}, '', '/demo/dashboard');
    expect(isProjectCardEnabled()).toBe(true);
    expect(isWorkloadHeatmapEnabled()).toBe(true);
  });

  it('leaves the flags to env defaults off /demo', () => {
    window.history.replaceState({}, '', '/app/dashboard');
    // env flags are unset in the test runner → both read false off the demo path
    expect(isProjectCardEnabled()).toBe(false);
    expect(isWorkloadHeatmapEnabled()).toBe(false);
  });
});
