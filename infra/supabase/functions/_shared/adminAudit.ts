// Admin console → Activity log: which admin actions are recorded and what of
// their request is kept — without any I/O (unit-tested in
// src/test/shared/adminAudit.test.ts). Reading and writing the table is
// admin/audit.ts.
//
// Kept: ids, roles, setting keys and values, names of workspaces and groups.
// Never kept: email addresses, message bodies, passwords, tokens.

export type AdminAuditEntry = {
  action: string;
  workspaceId: string | null;
  targetUserId: string | null;
  details: Record<string, unknown>;
};

const text = (payload: Record<string, unknown>, key: string, max = 200): string | null => {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
};

const entry = (
  action: string,
  details: Record<string, unknown> = {},
  workspaceId: string | null = null,
  targetUserId: string | null = null,
): AdminAuditEntry => ({ action, workspaceId, targetUserId, details });

/** The log entry for a super admin's action that went through, or null when it is not logged. */
export const adminAuditEntry = (action: string, payload: Record<string, unknown>): AdminAuditEntry | null => {
  switch (action) {
    case "settings.update":
      return entry(action, {
        key: text(payload, "key", 100),
        value: typeof payload.value === "boolean" ? payload.value : null,
      });
    case "workspaces.update":
      return entry(action, { name: text(payload, "name") }, text(payload, "workspaceId"));
    case "workspaces.delete":
      return entry(action, {}, text(payload, "workspaceId"));
    case "workspaces.addMember":
    case "workspaces.setMemberRole":
      return entry(action, { role: text(payload, "role", 20) }, text(payload, "workspaceId"), text(payload, "userId"));
    case "workspaces.removeMember":
      return entry(action, {}, text(payload, "workspaceId"), text(payload, "userId"));
    case "groupWorkspaces.create":
      return entry(
        action,
        { groupPath: text(payload, "groupPath", 255), role: text(payload, "role", 20) },
        text(payload, "workspaceId"),
      );
    case "groupWorkspaces.delete":
      return entry(action, { mappingId: text(payload, "id") });
    case "invites.revoke":
      return entry(action, { inviteId: text(payload, "inviteId") });
    case "broadcasts.send":
      return entry(action, {
        subject: text(payload, "subject"),
        audienceKind: text(payload, "audienceKind", 40),
        messageType: text(payload, "messageType", 40),
      });
    case "broadcasts.cancel":
      return entry(action, { broadcastId: text(payload, "broadcastId") });
    case "announcements.publish":
      return entry(action, { level: text(payload, "level", 20), audienceKind: text(payload, "audienceKind", 40) });
    case "announcements.update":
    case "announcements.unpublish":
    case "announcements.delete":
    case "announcements.resetReads":
      return entry(action, { announcementId: text(payload, "announcementId") });
    case "easterEggs.save":
      return entry(action, { eggKey: text(payload, "eggKey", 64), enabled: payload.enabled === true });
    case "easterEggs.delete":
      return entry(action, { id: text(payload, "id") });
    default:
      return null;
  }
};

// What the group sync did on its own (actor: nobody). One entry per change.
export type GroupSyncChange =
  | { kind: "added"; workspaceId: string; role: string }
  | { kind: "removed"; workspaceId: string }
  | { kind: "roleChanged"; workspaceId: string; from: string; role: string };

export const groupSyncAuditEntries = (userId: string, changes: GroupSyncChange[]): AdminAuditEntry[] => (
  changes.map((change) => {
    const details: Record<string, unknown> = { via: "groups" };
    if (change.kind === "added") details.role = change.role;
    if (change.kind === "roleChanged") {
      details.from = change.from;
      details.role = change.role;
    }
    return entry(`groups.${change.kind}`, details, change.workspaceId, userId);
  })
);
