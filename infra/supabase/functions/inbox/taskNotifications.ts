export type InboxNotificationType =
  | "task_assigned"
  | "comment_mention"
  | "task_updated"
  | "deadline_approaching"
  | "export_ready"
  | "export_failed";

export interface InboxNotificationRow {
  id: string;
  // Account-level notifications (`export_ready` / `export_failed`) are not tied to a workspace.
  workspace_id: string | null;
  actor_user_id: string | null;
  type: string;
  task_id: string | null;
  task_title_snapshot: string | null;
  task_start_date_snapshot: string | null;
  comment_id?: string | null;
  comment_preview?: string | null;
  created_at: string;
  read_at: string | null;
}

export interface InboxActorProfile {
  displayName: string | null;
  email: string | null;
}

export interface InboxTaskState {
  title: string | null;
  startDate: string | null;
}

export interface InboxTaskNotification {
  id: string;
  type: InboxNotificationType;
  // Null for account-level notifications (e.g. data export lifecycle events).
  workspaceId: string | null;
  workspaceName: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  taskId: string | null;
  taskTitle: string;
  taskStartDate: string | null;
  taskExists: boolean;
  commentId: string | null;
  commentPreview: string | null;
  createdAt: string;
  readAt: string | null;
}

const KNOWN_TYPES: ReadonlySet<InboxNotificationType> = new Set([
  "task_assigned",
  "comment_mention",
  "task_updated",
  "deadline_approaching",
  "export_ready",
  "export_failed",
]);

export const mapInboxTaskNotifications = (
  rows: InboxNotificationRow[],
  workspaceNames: Map<string, string>,
  profiles: Map<string, InboxActorProfile>,
  tasks: Map<string, InboxTaskState>,
): InboxTaskNotification[] => rows.flatMap((row) => {
  // A type this build predates is dropped, never relabeled: coercing used to
  // turn deadline reminders into phantom "assigned you" rows (actor = null →
  // "Unknown user"). The client hides unknown types anyway.
  if (!KNOWN_TYPES.has(row.type as InboxNotificationType)) return [];
  const type = row.type as InboxNotificationType;
  const actorProfile = typeof row.actor_user_id === "string"
    ? profiles.get(row.actor_user_id)
    : undefined;
  const taskState = typeof row.task_id === "string"
    ? tasks.get(row.task_id)
    : undefined;
  const isExportType = type === "export_ready" || type === "export_failed";
  const workspaceName = row.workspace_id
    ? workspaceNames.get(row.workspace_id) ?? "Workspace"
    : "";

  return {
    id: row.id,
    type,
    workspaceId: row.workspace_id,
    workspaceName,
    actorUserId: row.actor_user_id,
    actorDisplayName: actorProfile?.displayName ?? null,
    actorEmail: actorProfile?.email ?? null,
    taskId: row.task_id,
    taskTitle: taskState?.title ?? row.task_title_snapshot ?? "Untitled task",
    taskStartDate: taskState?.startDate ?? row.task_start_date_snapshot ?? null,
    taskExists: Boolean(taskState),
    commentId: type === "comment_mention" ? row.comment_id ?? null : null,
    // `comment_preview` is reused for the export_ready / export_failed human-readable body.
    commentPreview: type === "comment_mention" || isExportType
      ? row.comment_preview ?? null
      : null,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
});
