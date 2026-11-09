import { supabase } from '@/shared/lib/supabaseClient';
import { normalizeCapacityPercent } from '@/features/dashboard/lib/workloadHeatmap';
import type {
  DashboardGetState,
  DashboardSetState,
  DashboardState,
} from '@/features/dashboard/store/dashboardStore.contract';

// Each person's share in the workload heatmap (server setting
// heatmap.personCapacity, assignees.capacity_percent, migration 0178). Read
// only when the setting is on, so with it off nothing here ever runs.

type CapacityActions = Pick<DashboardState, 'loadPersonCapacities' | 'setPersonCapacity'>;

export const createDashboardCapacityActions = (
  set: DashboardSetState,
  get: DashboardGetState,
): CapacityActions => ({
  loadPersonCapacities: async (workspaceId) => {
    const { data, error } = await supabase
      .from('assignees')
      .select('id, capacity_percent')
      .eq('workspace_id', workspaceId);
    if (error) {
      // An older database without the column: everyone counts in full.
      set({ personCapacities: { workspaceId, values: {} } });
      return;
    }
    const values: Record<string, number> = {};
    ((data ?? []) as Array<{ id: string; capacity_percent: number | null }>).forEach((row) => {
      values[row.id] = normalizeCapacityPercent(row.capacity_percent ?? 100);
    });
    set({ personCapacities: { workspaceId, values } });
  },
  setPersonCapacity: async (workspaceId, assigneeId, percent) => {
    const value = normalizeCapacityPercent(percent);
    const previous = get().personCapacities;
    const base = previous?.workspaceId === workspaceId ? previous.values : {};
    set({ personCapacities: { workspaceId, values: { ...base, [assigneeId]: value } } });
    const { error } = await supabase
      .from('assignees')
      .update({ capacity_percent: value })
      .eq('id', assigneeId)
      .eq('workspace_id', workspaceId);
    if (error) {
      set({ personCapacities: previous });
      return { error: error.message };
    }
    return {};
  },
});
