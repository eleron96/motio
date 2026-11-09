import { supabase } from '@/shared/lib/supabaseClient';
import { normalizeLayouts, normalizeWidget } from '@/features/dashboard/lib/dashboardLayout';
import { uniqueDashboardName } from '@/features/dashboard/lib/dashboardTransfer';
import type {
  DashboardGetState,
  DashboardSetState,
  DashboardState,
} from '@/features/dashboard/store/dashboardStore.contract';

// A new dashboard with given widgets: a copy of the open one, or one loaded
// from a file (server setting dashboards.transfer). Same rules as "New
// dashboard": ten per workspace, names unique within it.

type TransferActions = Pick<DashboardState, 'createDashboardFrom'>;

export const createDashboardTransferActions = (
  set: DashboardSetState,
  get: DashboardGetState,
): TransferActions => ({
  createDashboardFrom: async (workspaceId, input) => {
    const { dashboards } = get();
    if (dashboards.length >= 10) return { error: 'Dashboard limit reached (10).' };

    const widgets = input.widgets.map((widget) => normalizeWidget(widget));
    const layouts = normalizeLayouts(input.layouts, widgets);
    const name = uniqueDashboardName(input.name, dashboards.map((dashboard) => dashboard.name));
    const { data, error } = await supabase
      .from('workspace_dashboards')
      .insert({ workspace_id: workspaceId, name, widgets, layouts })
      .select('id, name, created_at')
      .single();
    if (error || !data) {
      if ((error as { code?: string } | null)?.code === '23505') return { error: 'Dashboard name already exists.' };
      return { error: error?.message ?? 'Failed to create dashboard.' };
    }

    const next = {
      id: data.id as string,
      name: (data.name as string) ?? name,
      createdAt: (data.created_at as string) ?? null,
    };
    set((state) => ({
      dashboards: [...state.dashboards, next],
      currentDashboardId: next.id,
    }));
    return { id: next.id, name: next.name };
  },
});
