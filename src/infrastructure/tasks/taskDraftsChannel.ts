import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabaseClient';
import type { TaskDraftPresenceMeta } from '@/shared/domain/taskDraftPresence';

/**
 * Private Realtime Presence channel of one open task, `task-drafts:<task id>`.
 * Who may join and publish is decided on the server by the policies on
 * realtime.messages (migration 0159): members listen, editors share. A
 * stranger's join is refused, and a public channel of the same name is a
 * different channel that never sees these drafts.
 */
export type TaskDraftsChannel = {
  /** Replace what this person shares; an empty list stops sharing. */
  share: (meta: TaskDraftPresenceMeta) => void;
  leave: () => void;
};

export const joinTaskDraftsChannel = (
  taskId: string,
  userId: string,
  onState: (state: Record<string, unknown[]>) => void,
): TaskDraftsChannel => {
  let joined = false;
  let pending: TaskDraftPresenceMeta | null = null;

  const channel: RealtimeChannel = supabase.channel(`task-drafts:${taskId}`, {
    config: { private: true, presence: { key: userId } },
  });

  const publish = (meta: TaskDraftPresenceMeta) => {
    if (meta.drafts.length === 0) void channel.untrack();
    else void channel.track(meta);
  };

  channel
    .on('presence', { event: 'sync' }, () => {
      onState(channel.presenceState() as Record<string, unknown[]>);
    })
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      joined = true;
      // A draft typed before the join went through (or before a rejoin).
      if (pending) publish(pending);
    });

  return {
    share: (meta) => {
      pending = meta;
      if (joined) publish(meta);
    },
    leave: () => {
      void supabase.removeChannel(channel);
    },
  };
};
