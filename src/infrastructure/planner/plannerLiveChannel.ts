import { supabase } from '@/shared/lib/supabaseClient';

/**
 * The workspace-wide realtime channel behind the planner's live sync. Events
 * only say which row changed; the caller re-reads it through
 * `plannerLiveRepository`. Row-level security decides what reaches the
 * client, exactly as for reads.
 */
export type PlannerRowChange = { id: string; deleted: boolean };

export interface PlannerLiveHandlers {
  onTaskChange: (change: PlannerRowChange) => void;
  onMilestoneChange: (change: PlannerRowChange) => void;
  /** A comment on this task was added, edited or removed. */
  onTaskCommentChange: (taskId: string) => void;
  /** Any absence in the workspace changed. */
  onTimeOffChange: () => void;
  /** Channel status from supabase-js: SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED. */
  onStatus: (status: string) => void;
}

const changedRow = (payload: { eventType: string; old: unknown; new: unknown }) => {
  const deleted = payload.eventType === 'DELETE';
  return { deleted, row: (deleted ? payload.old : payload.new) as Record<string, unknown> | null };
};

/** Opens the channel; the returned function closes it. */
export const openPlannerLiveChannel = (
  workspaceId: string,
  handlers: PlannerLiveHandlers,
): (() => Promise<void>) => {
  const filter = `workspace_id=eq.${workspaceId}`;
  const channel = supabase
    .channel(`planner-live-${workspaceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments', filter }, (payload) => {
      const { row } = changedRow(payload);
      if (typeof row?.task_id === 'string') handlers.onTaskCommentChange(row.task_id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter }, (payload) => {
      const { deleted, row } = changedRow(payload);
      if (typeof row?.id === 'string') handlers.onTaskChange({ id: row.id, deleted });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'milestones', filter }, (payload) => {
      const { deleted, row } = changedRow(payload);
      if (typeof row?.id === 'string') handlers.onMilestoneChange({ id: row.id, deleted });
    })
    // DELETE payloads only carry the identity columns; the table is REPLICA
    // IDENTITY FULL (migration 0131) so the workspace filter still matches them.
    .on('postgres_changes', { event: '*', schema: 'public', table: 'time_off', filter }, () => {
      handlers.onTimeOffChange();
    })
    .subscribe((status) => handlers.onStatus(status));

  return async () => {
    await supabase.removeChannel(channel);
  };
};
