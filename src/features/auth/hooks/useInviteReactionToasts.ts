import { useCallback, useEffect, useRef } from 'react';
import { t } from '@lingui/macro';
import { toast } from '@/shared/ui/sonner';
import type { SentInviteSummary } from '@/infrastructure/notifications/inboxRepository';

const REACTION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REMEMBERED_REACTIONS = 400;

/**
 * Toasts "accepted"/"declined" for invites this person sent — once per answer.
 * Answers seen are remembered per user in localStorage; answers older than the
 * browser session (or a week) are not news and stay quiet.
 */
export const useInviteReactionToasts = (userId: string | null) => {
  const seenRef = useRef<Set<string>>(new Set());
  const sessionStartedAtRef = useRef<number>(Date.now());
  const seenStorageKey = userId ? `invite-reactions-seen-${userId}` : null;
  const sessionStorageKey = userId ? `invite-reactions-session-started-${userId}` : null;

  useEffect(() => {
    if (!sessionStorageKey || typeof window === 'undefined') {
      sessionStartedAtRef.current = Date.now();
      return;
    }

    const storedSessionStart = Number(window.sessionStorage.getItem(sessionStorageKey));
    if (Number.isFinite(storedSessionStart) && storedSessionStart > 0) {
      sessionStartedAtRef.current = storedSessionStart;
      return;
    }

    const nextSessionStart = Date.now();
    sessionStartedAtRef.current = nextSessionStart;
    window.sessionStorage.setItem(sessionStorageKey, String(nextSessionStart));
  }, [sessionStorageKey]);

  useEffect(() => {
    if (!seenStorageKey || typeof window === 'undefined') {
      seenRef.current = new Set();
      return;
    }

    try {
      const raw = window.localStorage.getItem(seenStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      const values = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
      seenRef.current = new Set(values);
    } catch (_error) {
      seenRef.current = new Set();
    }
  }, [seenStorageKey]);

  return useCallback((sentInvites: SentInviteSummary[]) => {
    const now = Date.now();
    let seenChanged = false;

    sentInvites.forEach((invite) => {
      if (invite.status !== 'accepted' && invite.status !== 'declined') return;
      if (!invite.respondedAt) return;

      const respondedAtMs = Date.parse(invite.respondedAt);
      if (!Number.isFinite(respondedAtMs)) return;
      if (respondedAtMs < sessionStartedAtRef.current) return;
      if (now - respondedAtMs > REACTION_MAX_AGE_MS) return;

      const reactionKey = `${invite.token}:${invite.status}`;
      if (seenRef.current.has(reactionKey)) return;

      seenRef.current.add(reactionKey);
      seenChanged = true;
      const statusLabel = invite.status === 'accepted' ? t`Accepted` : t`Declined`;
      toast(t`Invite update`, {
        description: `${invite.email} ${statusLabel} (${invite.workspaceName})`,
      });
    });

    if (seenChanged && seenStorageKey && typeof window !== 'undefined') {
      const values = Array.from(seenRef.current).slice(-REMEMBERED_REACTIONS);
      window.localStorage.setItem(seenStorageKey, JSON.stringify(values));
    }
  }, [seenStorageKey]);
};
