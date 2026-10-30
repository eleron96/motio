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
 *
 * Events missed while the socket was down are gone, so `onResync` asks the
 * caller to re-read everything: on every subscribe — the first one too, which
 * covers changes between the card's first load and the join — after a
 * re-subscribe (laptop woke up, Wi-Fi came back), and when the tab becomes
 * visible again.
 */
export type OpenTaskLiveTable = 'task_subtasks' | 'task_comments';

export type OpenTaskRowChange = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  rowId: string;
};

/**
 * Each subscription gets a channel name of its own: supabase-js hands back an
 * existing channel of the same name, and one still leaving (reopening the
 * same task right after closing it) would swallow the new subscription.
 */
let channelSeq = 0;

export const subscribeToOpenTaskRows = (
  table: OpenTaskLiveTable,
  taskId: string,
  onChange: (change: OpenTaskRowChange) => void,
  onResync?: () => void,
): (() => void) => {
  channelSeq += 1;
  const channel = supabase
    .channel(`open-task-${table}-${taskId}-${channelSeq}`)
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
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onResync?.();
    });

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') onResync?.();
  };
  if (onResync && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  return () => {
    if (onResync && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    void supabase.removeChannel(channel);
  };
};
