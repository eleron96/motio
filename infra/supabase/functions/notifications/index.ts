import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createSupabaseClients, getProfileMap } from "../_shared/supabaseAuth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationAction = "list" | "markRead" | "markUnread" | "delete";
type NotificationType = "task_assigned" | "comment_mention";

interface NotificationsPayload {
  action?: NotificationAction;
  notificationId?: string;
  limit?: number;
}

interface AuthNotificationsUser {
  id: string;
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const readJson = async <T>(req: Request) => {
  try {
    return { data: (await req.json()) as T };
  } catch (_error) {
    return { error: "Invalid JSON body" };
  }
};

const getAuthUser = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return { error: "Unauthorized", status: 401 };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return { error: "Unauthorized", status: 401 };
  }

  return { user: authData.user };
};

const getWorkspaceAccessSet = async (workspaceIds: string[], userId: string) => {
  const uniqueIds = Array.from(new Set(workspaceIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { workspaceIds: new Set<string>() };
  }

  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .in("workspace_id", uniqueIds);

  if (error) {
    return { error: error.message };
  }

  return {
    workspaceIds: new Set(
      (data ?? [])
        .map((row) => row.workspace_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  };
};

const handleList = async (
  authUser: AuthNotificationsUser,
  payload: NotificationsPayload,
) => {
  const requestedLimit = Number(payload.limit ?? 60);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(200, Math.floor(requestedLimit)))
    : 60;

  const { data: rows, error } = await supabaseAdmin
    .from("user_notifications")
    .select("id, workspace_id, actor_user_id, type, task_id, task_title_snapshot, task_start_date_snapshot, comment_id, comment_preview, created_at, read_at")
    .eq("recipient_user_id", authUser.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  const workspaceIds = Array.from(new Set(
    (rows ?? [])
      .map((row) => row.workspace_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  const accessResult = await getWorkspaceAccessSet(workspaceIds, authUser.id);
  if ("error" in accessResult) {
    return jsonResponse({ error: accessResult.error }, 400);
  }

  const visibleRows = (rows ?? []).filter((row) => accessResult.workspaceIds.has(row.workspace_id));

  const visibleWorkspaceIds = Array.from(new Set(
    visibleRows
      .map((row) => row.workspace_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  let workspaceNameMap = new Map<string, string>();
  if (visibleWorkspaceIds.length > 0) {
    const { data: workspaceRows, error: workspaceError } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .in("id", visibleWorkspaceIds);

    if (workspaceError) {
      return jsonResponse({ error: workspaceError.message }, 400);
    }

    workspaceNameMap = new Map(
      (workspaceRows ?? [])
        .filter((row): row is { id: string; name: string } => typeof row.id === "string")
        .map((row) => [row.id, row.name ?? "Workspace"]),
    );
  }

  const actorIds = Array.from(new Set(
    visibleRows
      .map((row) => row.actor_user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  const profileResult = await getProfileMap(supabaseAdmin, actorIds);
  if ("error" in profileResult) {
    return jsonResponse({ error: profileResult.error }, 400);
  }

  const taskIds = Array.from(new Set(
    visibleRows
      .map((row) => row.task_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  let taskMap = new Map<string, { title: string | null; startDate: string | null }>();
  if (taskIds.length > 0) {
    const { data: taskRows, error: taskError } = await supabaseAdmin
      .from("tasks")
      .select("id, title, start_date")
      .in("id", taskIds);

    if (taskError) {
      return jsonResponse({ error: taskError.message }, 400);
    }

    taskMap = new Map(
      (taskRows ?? [])
        .filter((row): row is { id: string; title: string | null; start_date: string | null } => typeof row.id === "string")
        .map((row) => [row.id, { title: row.title ?? null, startDate: row.start_date ?? null }]),
    );
  }

  const notifications = visibleRows.map((row) => {
    const actorProfile = typeof row.actor_user_id === "string"
      ? profileResult.profiles.get(row.actor_user_id)
      : undefined;
    const taskState = typeof row.task_id === "string"
      ? taskMap.get(row.task_id)
      : undefined;

    return {
      id: row.id,
      type: row.type as NotificationType,
      workspaceId: row.workspace_id,
      workspaceName: workspaceNameMap.get(row.workspace_id) ?? "Workspace",
      actorUserId: row.actor_user_id,
      actorDisplayName: actorProfile?.displayName ?? null,
      actorEmail: actorProfile?.email ?? null,
      taskId: row.task_id,
      taskTitle: taskState?.title ?? row.task_title_snapshot ?? "Untitled task",
      taskStartDate: taskState?.startDate ?? row.task_start_date_snapshot ?? null,
      taskExists: Boolean(taskState),
      commentId: (row as Record<string, unknown>).comment_id ?? null,
      commentPreview: (row as Record<string, unknown>).comment_preview ?? null,
      createdAt: row.created_at,
      readAt: row.read_at,
    };
  });

  return jsonResponse({ success: true, notifications });
};

const ensureNotificationAccess = async (notificationId: string, userId: string) => {
  const { data: row, error } = await supabaseAdmin
    .from("user_notifications")
    .select("id, workspace_id, recipient_user_id, deleted_at")
    .eq("id", notificationId)
    .maybeSingle();

  if (error) {
    return { error: error.message, status: 400 };
  }

  if (!row || row.recipient_user_id !== userId) {
    return { error: "Notification not found.", status: 404 };
  }

  const accessResult = await getWorkspaceAccessSet([row.workspace_id], userId);
  if ("error" in accessResult) {
    return { error: accessResult.error, status: 400 };
  }

  if (!accessResult.workspaceIds.has(row.workspace_id)) {
    return { error: "Forbidden", status: 403 };
  }

  return { row };
};

const handleUpdate = async (
  authUser: AuthNotificationsUser,
  payload: NotificationsPayload,
  action: Exclude<NotificationAction, "list">,
) => {
  const notificationId = payload.notificationId?.trim() ?? "";
  if (!notificationId) {
    return jsonResponse({ error: "notificationId is required." }, 400);
  }

  const accessResult = await ensureNotificationAccess(notificationId, authUser.id);
  if ("error" in accessResult) {
    return jsonResponse({ error: accessResult.error }, accessResult.status ?? 400);
  }

  if (accessResult.row.deleted_at) {
    return jsonResponse({ success: true });
  }

  if (action === "delete") {
    const { error } = await supabaseAdmin
      .from("user_notifications")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_user_id", authUser.id)
      .is("deleted_at", null);

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ success: true });
  }

  const nextReadAt = action === "markRead" ? new Date().toISOString() : null;
  const { error } = await supabaseAdmin
    .from("user_notifications")
    .update({ read_at: nextReadAt })
    .eq("id", notificationId)
    .eq("recipient_user_id", authUser.id)
    .is("deleted_at", null);

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ success: true });
};

const handleNotifications = async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase env vars" }, 500);
  }

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status ?? 401);
  }

  const { data: payload, error } = await readJson<NotificationsPayload>(req);
  if (error) {
    return jsonResponse({ error }, 400);
  }

  const action = payload.action ?? "list";
  if (action === "markRead" || action === "markUnread" || action === "delete") {
    return handleUpdate(authResult.user, payload, action);
  }

  return handleList(authResult.user, payload);
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return handleNotifications(req);
};

if (import.meta.main) {
  serve(handler);
}
