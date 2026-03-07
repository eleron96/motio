export const WORKSPACE_MEMBER_ACTIVITY_ACTIONS = [
  'invite_created',
  'member_role_changed',
  'member_group_changed',
  'member_removed',
  'member_status_changed',
  'group_created',
  'group_renamed',
  'group_deleted',
] as const;

export type WorkspaceMemberActivityAction = (typeof WORKSPACE_MEMBER_ACTIVITY_ACTIONS)[number];

export type WorkspaceMemberActivityDetails = {
  inviteRole?: string | null;
  inviteGroupName?: string | null;
  previousRole?: string | null;
  nextRole?: string | null;
  previousGroupName?: string | null;
  nextGroupName?: string | null;
  previousStatus?: 'active' | 'disabled' | null;
  nextStatus?: 'active' | 'disabled' | null;
  groupName?: string | null;
};

export type WorkspaceMemberActivityEntry = {
  id: string;
  workspaceId: string;
  action: WorkspaceMemberActivityAction;
  actorUserId: string | null;
  actorLabel: string;
  targetUserId: string | null;
  targetLabel: string | null;
  targetEmail: string | null;
  details: WorkspaceMemberActivityDetails;
  createdAt: string;
};

const trimToNull = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

export const buildWorkspaceMemberActivityActorLabel = (
  displayName: string | null | undefined,
  email: string | null | undefined,
  fallback = 'Unknown user',
) => (
  trimToNull(displayName) ?? trimToNull(email) ?? fallback
);

export const buildWorkspaceMemberActivityActorSnapshot = (params: {
  userId?: string | null;
  displayName?: string | null;
  email?: string | null;
}) => ({
  actorUserId: params.userId ?? null,
  actorLabel: buildWorkspaceMemberActivityActorLabel(params.displayName, params.email),
});

export const buildWorkspaceMemberActivityTargetLabel = (
  displayName: string | null | undefined,
  email: string | null | undefined,
  fallback = 'Unknown member',
) => (
  trimToNull(displayName) ?? trimToNull(email) ?? fallback
);
