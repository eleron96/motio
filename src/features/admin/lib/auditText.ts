import { t } from '@lingui/macro';
import { formatWorkspaceRole } from '@/features/admin/lib/format';
import { serverSettingText } from '@/features/admin/lib/serverSettingLabels';

// Admin → Activity log: one line per entry, in the reader's language. The
// entries come from the admin function (admin/audit.ts); what each one keeps is
// decided in infra/supabase/functions/_shared/adminAudit.ts.

export type AdminAuditRecord = {
  id: number;
  createdAt: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  targetUserId: string | null;
  targetName: string | null;
  details: Record<string, unknown>;
};

const str = (value: unknown) => (typeof value === 'string' ? value : '');

const role = (value: unknown) => {
  const name = str(value);
  return name === 'admin' || name === 'editor' || name === 'viewer' || name === 'owner'
    ? formatWorkspaceRole(name)
    : name;
};

/** Who did it: a person, the group sync, or the command line. */
export const auditActor = (entry: AdminAuditRecord) => {
  if (entry.actorId) return entry.actorName ?? entry.actorId;
  if (entry.action.startsWith('groups.')) return t`Keycloak groups`;
  if (entry.details.via === 'cli') return t`Command line`;
  return '—';
};

/** What happened, without who and when. */
export const auditText = (entry: AdminAuditRecord) => {
  const target = entry.targetName ?? entry.targetUserId ?? '—';
  const details = entry.details;
  switch (entry.action) {
    case 'settings.update': {
      const setting = serverSettingText(str(details.key)).title;
      if (details.value === true) return t`Turned on: ${setting}`;
      if (details.value === false) return t`Turned off: ${setting}`;
      return t`Back to the default: ${setting}`;
    }
    case 'workspaces.update': {
      const name = str(details.name);
      return t`Renamed the workspace to ${name}`;
    }
    case 'workspaces.delete':
      return t`Deleted the workspace`;
    case 'workspaces.addMember': {
      const label = role(details.role);
      return t`Added ${target} as ${label}`;
    }
    case 'workspaces.setMemberRole': {
      const label = role(details.role);
      return t`Changed the role of ${target} to ${label}`;
    }
    case 'workspaces.removeMember':
      return t`Removed ${target} from the workspace`;
    case 'groupWorkspaces.create': {
      const group = str(details.groupPath);
      const label = role(details.role);
      return t`Group ${group} now puts people in as ${label}`;
    }
    case 'groupWorkspaces.delete':
      return t`Removed a group mapping`;
    case 'groups.added': {
      const label = role(details.role);
      return t`Put ${target} in as ${label}`;
    }
    case 'groups.removed':
      return t`Took ${target} out: no mapped group any more`;
    case 'groups.roleChanged': {
      const from = role(details.from);
      const to = role(details.role);
      return t`Changed the role of ${target}: ${from} → ${to}`;
    }
    case 'invites.revoke':
      return t`Revoked an invitation`;
    case 'broadcasts.send': {
      const subject = str(details.subject);
      return t`Sent a broadcast: ${subject}`;
    }
    case 'broadcasts.cancel':
      return t`Cancelled a broadcast`;
    case 'announcements.publish':
      return t`Published an announcement`;
    case 'announcements.update':
      return t`Changed an announcement`;
    case 'announcements.unpublish':
      return t`Took an announcement down`;
    case 'announcements.delete':
      return t`Deleted an announcement`;
    case 'announcements.resetReads':
      return t`Showed an announcement to everyone again`;
    case 'easterEggs.save':
    case 'easterEggs.delete':
      return t`Changed an easter egg`;
    default:
      return entry.action;
  }
};
