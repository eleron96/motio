import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/features/auth/store/authStore';
import { joinTaskDraftsChannel, TaskDraftsChannel } from '@/infrastructure/tasks/taskDraftsChannel';
import {
  areTaskDraftsEqual,
  clampTaskDraft,
  collectTeammateDrafts,
  TaskDraft,
  TaskDraftSlot,
  TeammateDraft,
} from '@/shared/domain/taskDraftPresence';

/** Keystrokes are batched: at most one presence update per this interval. */
const SHARE_INTERVAL_MS = 300;

export type TeammateDraftView = TeammateDraft & {
  name: string;
  avatarUrl: string | null;
};

export type ShareTaskDraft = (slot: TaskDraftSlot, draft: TaskDraft | null) => void;

export interface UseTaskDraftPresenceResult {
  teammateDrafts: TeammateDraftView[];
  shareDraft: ShareTaskDraft;
}

const NO_DRAFTS: TeammateDraftView[] = [];
const noopShare: ShareTaskDraft = () => {};

/**
 * Live drafts of an open task (see shared/domain/taskDraftPresence): joins the
 * task's private channel while the card is open and `enabled`, shares what
 * this person types slot by slot, and returns what teammates type.
 */
export const useTaskDraftPresence = ({
  taskId,
  enabled,
}: {
  taskId: string | null;
  enabled: boolean;
}): UseTaskDraftPresenceResult => {
  const selfUserId = useAuthStore((state) => state.user?.id ?? null);
  const members = useAuthStore((state) => state.members);
  const [presenceState, setPresenceState] = useState<Record<string, unknown[]>>({});
  const channelRef = useRef<TaskDraftsChannel | null>(null);
  const slotsRef = useRef(new Map<TaskDraftSlot, TaskDraft>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const active = enabled && Boolean(taskId) && Boolean(selfUserId);

  const flush = useCallback(() => {
    if (!selfUserId) return;
    dirtyRef.current = false;
    channelRef.current?.share({ userId: selfUserId, drafts: [...slotsRef.current.values()] });
  }, [selfUserId]);

  useEffect(() => {
    if (!active || !taskId || !selfUserId) return;
    const channel = joinTaskDraftsChannel(taskId, selfUserId, setPresenceState);
    channelRef.current = channel;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      dirtyRef.current = false;
      slotsRef.current = new Map();
      channelRef.current = null;
      channel.leave();
      setPresenceState({});
    };
  }, [active, selfUserId, taskId]);

  const shareDraft = useCallback<ShareTaskDraft>((slot, draft) => {
    const slots = slotsRef.current;
    const next = draft ? clampTaskDraft(draft) : null;
    if (areTaskDraftsEqual(slots.get(slot) ?? null, next)) return;
    if (next) slots.set(slot, next);
    else slots.delete(slot);

    // First change goes out at once, the rest of a burst once per interval.
    if (timerRef.current) {
      dirtyRef.current = true;
      return;
    }
    flush();
    timerRef.current = setTimeout(function drain() {
      if (dirtyRef.current) {
        flush();
        timerRef.current = setTimeout(drain, SHARE_INTERVAL_MS);
        return;
      }
      timerRef.current = null;
    }, SHARE_INTERVAL_MS);
  }, [flush]);

  const teammateDrafts = useMemo(() => {
    if (!active) return NO_DRAFTS;
    const memberById = new Map(members.map((member) => [member.userId, member]));
    return collectTeammateDrafts(presenceState, selfUserId, new Set(memberById.keys()))
      .map((entry) => {
        const member = memberById.get(entry.userId);
        return {
          ...entry,
          name: member?.displayName || member?.email || '',
          avatarUrl: member?.avatarUrl ?? null,
        };
      });
  }, [active, members, presenceState, selfUserId]);

  return { teammateDrafts, shareDraft: active ? shareDraft : noopShare };
};
