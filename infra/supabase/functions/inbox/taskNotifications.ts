export type InboxNotificationType = "task_assigned" | "comment_mention";

export interface InboxNotificationRow {
  id: string;
  workspace_id: string;
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
  workspaceId: string;
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

const toNotificationType = (value: string): InboxNotificationType => (
  value === "comment_mention" ? "comment_mention" : "task_assigned"
);

export const mapInboxTaskNotifications = (
  rows: InboxNotificationRow[],
  workspaceNames: Map<string, string>,
  profiles: Map<string, InboxActorProfile>,
  tasks: Map<string, InboxTaskState>,
): InboxTaskNotification[] => rows.map((row) => {
  const actorProfile = typeof row.actor_user_id === "string"
    ? profiles.get(row.actor_user_id)
    : undefined;
  const taskState = typeof row.task_id === "string"
    ? tasks.get(row.task_id)
    : undefined;
  const type = toNotificationType(row.type);

  return {
    id: row.id,
    type,
    workspaceId: row.workspace_id,
    workspaceName: workspaceNames.get(row.workspace_id) ?? "Workspace",
    actorUserId: row.actor_user_id,
    actorDisplayName: actorProfile?.displayName ?? null,
    actorEmail: actorProfile?.email ?? null,
    taskId: row.task_id,
    taskTitle: taskState?.title ?? row.task_title_snapshot ?? "Untitled task",
    taskStartDate: taskState?.startDate ?? row.task_start_date_snapshot ?? null,
    taskExists: Boolean(taskState),
    commentId: type === "comment_mention" ? row.comment_id ?? null : null,
    commentPreview: type === "comment_mention" ? row.comment_preview ?? null : null,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
});
