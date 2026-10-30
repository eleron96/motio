import { supabase } from '@/shared/lib/supabaseClient';

/**
 * Live changes to rows that hang off one open task (its subtasks, its
 * comments). The workspace-wide planner channel follows tasks themselves; a
 * card subscribes here only while it is open, so the extra load is one small
 * channel per person with a card open.
 *
 * Row-level security decides what reaches the client, exactly as for reads.
 * The handler gets only what changed and which row — callers re-read through
 * their usual repository instead of trusting the event payload.
 */
export type OpenTaskLiveTable = 'task_subtasks' | 'task_comments';

export type OpenTaskRowChange = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  rowId: string;
};

export const subscribeToOpenTaskRows = (
  table: OpenTaskLiveTable,
  taskId: string,
  onChange: (change: OpenTaskRowChange) => void,
): (() => void) => {
  const channel = supabase
    .channel(`open-task-${table}-${taskId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: `task_id=eq.${taskId}`,
      },
      (payload) => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as { id?: unknown } | null;
        if (typeof row?.id !== 'string') return;
        onChange({ type: payload.eventType, rowId: row.id });
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};
