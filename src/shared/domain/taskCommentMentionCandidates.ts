export type WorkspaceMentionMember = {
  userId: string | null | undefined;
  email: string | null | undefined;
  displayName: string | null | undefined;
};

export type TaskCommentMentionCandidate = {
  id: string;
  userId: string;
  name: string;
};

export const buildTaskCommentMentionCandidates = (
  members: WorkspaceMentionMember[],
): TaskCommentMentionCandidate[] => {
  const byUserId = new Map<string, TaskCommentMentionCandidate>();

  members.forEach((member) => {
    const userId = (member.userId ?? '').trim();
    if (!userId || byUserId.has(userId)) return;

    const displayName = (member.displayName ?? '').trim();
    const email = (member.email ?? '').trim();
    const name = displayName || email;
    if (!name) return;

    byUserId.set(userId, {
      id: userId,
      userId,
      name,
    });
  });

  return Array.from(byUserId.values()).sort((left, right) => (
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
  ));
};
