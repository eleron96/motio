import { useCallback } from 'react';
import { usePersonColors } from '@/features/planner/hooks/usePersonColors';
import type { WorkspaceMember } from '@/features/auth/store/authStore.contract';
import type { Assignee } from '@/features/planner/types/planner';

/** What the avatar of a people row is drawn from: photo, account, email and colour. */
export const useAssigneeAvatarInfo = (assignees: Assignee[], members: WorkspaceMember[]) => {
  const personColors = usePersonColors();

  return useCallback((rowId: string): {
    avatarUrl: string | null;
    userId: string;
    email: string | null;
    color: string | null;
  } => {
    const assignee = assignees.find((a) => a.id === rowId);
    const userId = assignee?.userId ?? rowId;
    const member = members.find((m) => m.userId === userId);
    // Workspace profile email wins; assignees without an account (external
    // people) fall back to the contact email stored on the assignee itself.
    return {
      avatarUrl: member?.avatarUrl ?? null,
      userId,
      email: member?.email ?? assignee?.email ?? null,
      // The colour in effect, not just a hand-picked one: an avatar has to match
      // the person's day-off circles and chart series either way.
      color: personColors.byAssigneeId.get(rowId) ?? null,
    };
  }, [assignees, members, personColors]);
};
