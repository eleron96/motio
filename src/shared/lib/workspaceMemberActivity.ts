import { t } from '@lingui/macro';
import { WorkspaceMemberActivityEntry } from '@/shared/domain/workspaceMemberActivity';

const trimToNull = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const wrapLabel = (value: string | null | undefined, fallback: string) => (
  trimToNull(value) ?? fallback
);

const formatRole = (value: string | null | undefined) => {
  if (value === 'admin') return t`admin`;
  if (value === 'editor') return t`editor`;
  if (value === 'viewer') return t`viewer`;
  return wrapLabel(value, t`unknown role`);
};

const formatStatus = (value: 'active' | 'disabled' | null | undefined) => (
  value === 'disabled' ? t`disabled` : t`active`
);

export const formatWorkspaceMemberActivity = (
  entry: WorkspaceMemberActivityEntry,
) => {
  const actor = wrapLabel(entry.actorLabel, t`Unknown user`);
  const target = wrapLabel(entry.targetLabel ?? entry.targetEmail, t`Unknown member`);
  const {
    inviteRole,
    inviteGroupName,
    previousRole,
    nextRole,
    previousGroupName,
    nextGroupName,
    previousStatus,
    nextStatus,
    groupName,
  } = entry.details;

  switch (entry.action) {
    case 'invite_created': {
      const rolePart = formatRole(inviteRole);
      const groupPart = trimToNull(inviteGroupName);
      return groupPart
        ? t`${actor} invited ${target} as ${rolePart} in ${groupPart}.`
        : t`${actor} invited ${target} as ${rolePart}.`;
    }
    case 'member_role_changed':
      return t`${actor} changed ${target} from ${formatRole(previousRole)} to ${formatRole(nextRole)}.`;
    case 'member_group_changed': {
      const fromGroup = wrapLabel(previousGroupName, t`No group`);
      const toGroup = wrapLabel(nextGroupName, t`No group`);
      return t`${actor} changed ${target} group from ${fromGroup} to ${toGroup}.`;
    }
    case 'member_removed':
      return t`${actor} removed ${target} from the workspace.`;
    case 'member_status_changed':
      return t`${actor} changed ${target} status from ${formatStatus(previousStatus)} to ${formatStatus(nextStatus)}.`;
    case 'group_created':
      return t`${actor} created the group ${wrapLabel(groupName, t`Unnamed group`)}.`;
    case 'group_renamed':
      return t`${actor} renamed group ${wrapLabel(previousGroupName, t`Unnamed group`)} to ${wrapLabel(nextGroupName, t`Unnamed group`)}.`;
    case 'group_deleted':
      return t`${actor} deleted the group ${wrapLabel(groupName, t`Unnamed group`)}.`;
    default:
      return t`${actor} updated workspace access.`;
  }
};
