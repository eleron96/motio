import { supabase } from '@/shared/lib/supabaseClient';
import type {
  PlannerGetState,
  PlannerSetState,
  PlannerStore,
} from '@/features/planner/store/plannerStore.contract';
import {
  mapTimeOffRow,
  TimeOffRow,
  type TimeOffMutationResult,
} from '@/features/planner/store/plannerStore.helpers';

const emptyResult: TimeOffMutationResult = {};

/**
 * Map the guards from migration 0131 onto a machine-readable reason so the UI
 * can say "you already have days off then" instead of echoing Postgres.
 * 23P01 — overlapping period (trigger, and the EXCLUDE constraint where
 * btree_gist is available); 23514 — end before start.
 */
const classify = (error: unknown): TimeOffMutationResult['code'] => {
  const code = (error as { code?: string } | null)?.code;
  if (code === '23P01') return 'overlap';
  if (code === '23514') return 'invalidRange';
  return undefined;
};

const failure = (error: unknown, fallback: string): TimeOffMutationResult => {
  console.error(error);
  const message = (error as { message?: string } | null)?.message ?? fallback;
  const code = classify(error);
  return code ? { error: message, code } : { error: message };
};

export const createTimeOffActions = (set: PlannerSetState, get: PlannerGetState): Pick<
  PlannerStore,
  'addTimeOff' | 'updateTimeOff' | 'deleteTimeOff' | 'setTimeOff' | 'setTimeOffDragPreview'
> => ({
  // workspace_id is sent explicitly even though the time_off_sync_workspace
  // trigger overwrites it from the assignee: the /demo sandbox has no triggers,
  // and a row without it would be invisible to every workspace-filtered query.
  // On a real backend the trigger still has the last word, so a client cannot
  // file a record into a workspace the person does not belong to.
  addTimeOff: async (input) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { data, error } = await supabase
      .from('time_off')
      .insert({
        workspace_id: workspaceId,
        assignee_id: input.assigneeId,
        start_date: input.startDate,
        end_date: input.endDate,
        note: input.note ?? null,
      })
      .select('id, workspace_id, assignee_id, start_date, end_date, note')
      .single();

    if (error || !data) return failure(error, 'Failed to save the time off.');

    set((state) => ({ timeOff: [...state.timeOff, mapTimeOffRow(data as TimeOffRow)] }));
    return emptyResult;
  },

  updateTimeOff: async (id, updates) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const payload: Record<string, unknown> = {};
    if ('startDate' in updates) payload.start_date = updates.startDate;
    if ('endDate' in updates) payload.end_date = updates.endDate;
    if ('note' in updates) payload.note = updates.note;
    if (Object.keys(payload).length === 0) return emptyResult;

    const { data, error } = await supabase
      .from('time_off')
      .update(payload)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('id, workspace_id, assignee_id, start_date, end_date, note')
      .single();

    if (error || !data) return failure(error, 'Failed to save the time off.');

    const updated = mapTimeOffRow(data as TimeOffRow);
    set((state) => ({
      timeOff: state.timeOff.map((item) => (item.id === id ? updated : item)),
    }));
    return emptyResult;
  },

  deleteTimeOff: async (id) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return { error: 'Workspace not selected.' };

    const { data, error } = await supabase
      .from('time_off')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select('id');

    if (error) return failure(error, 'Failed to delete the time off.');
    // RLS filters a forbidden row out silently instead of raising, so an empty
    // result means "not yours", not "done".
    if (!data || data.length === 0) return { error: 'Failed to delete the time off.' };

    set((state) => ({ timeOff: state.timeOff.filter((item) => item.id !== id) }));
    return emptyResult;
  },

  // Realtime refetches the whole window: the table is sparse, so a full replace
  // is cheaper and simpler than the per-id reconcile the tasks pipeline needs.
  setTimeOff: (records) => set({ timeOff: records }),

  setTimeOffDragPreview: (preview) => set({ timeOffDragPreview: preview }),
});
