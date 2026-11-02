import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createSupabaseClients } from "../_shared/supabaseAuth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationAction = "markRead" | "markUnread" | "markAllRead" | "markTaskRead" | "deleteAll" | "delete";

interface NotificationsPayload {
  action?: NotificationAction;
  notificationId?: string;
  taskId?: string;
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

  // Account-level notifications (workspace_id IS NULL): recipient match is sufficient.
  if (row.workspace_id === null) {
    return { row };
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
  action: Exclude<NotificationAction, "markAllRead">,
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

const handleMarkAllRead = async (authUser: AuthNotificationsUser) => {
  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", authUser.id);

  if (membershipsError) {
    return jsonResponse({ error: membershipsError.message }, 400);
  }

  const workspaceIds = Array.from(new Set(
    (memberships ?? [])
      .map((row) => row.workspace_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  const readAt = new Date().toISOString();
  let total = 0;

  // Workspace-scoped notifications (task_assigned / comment_mention).
  if (workspaceIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("user_notifications")
      .update({ read_at: readAt })
      .eq("recipient_user_id", authUser.id)
      .is("deleted_at", null)
      .is("read_at", null)
      .in("workspace_id", workspaceIds)
      .select("id");
    if (error) return jsonResponse({ error: error.message }, 400);
    total += (data ?? []).length;
  }

  // Account-level notifications (workspace_id IS NULL — export_ready / export_failed).
  const { data: accountRows, error: accountError } = await supabaseAdmin
    .from("user_notifications")
    .update({ read_at: readAt })
    .eq("recipient_user_id", authUser.id)
    .is("deleted_at", null)
    .is("read_at", null)
    .is("workspace_id", null)
    .select("id");
  if (accountError) return jsonResponse({ error: accountError.message }, 400);
  total += (accountRows ?? []).length;

  return jsonResponse({ success: true, updated: total });
};

// Opening a task's card counts as seeing what the notifications about it said:
// every unread, non-deleted notification of this user for that task is read.
// Scoped by recipient, so a task id from another workspace changes nothing.
const handleMarkTaskRead = async (authUser: AuthNotificationsUser, payload: NotificationsPayload) => {
  const taskId = payload.taskId?.trim() ?? "";
  if (!taskId) {
    return jsonResponse({ error: "taskId is required." }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_user_id", authUser.id)
    .eq("task_id", taskId)
    .is("deleted_at", null)
    .is("read_at", null)
    .select("id");

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ success: true, updated: (data ?? []).length });
};

const handleDeleteAll = async (authUser: AuthNotificationsUser) => {
  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", authUser.id);

  if (membershipsError) {
    return jsonResponse({ error: membershipsError.message }, 400);
  }

  const workspaceIds = Array.from(new Set(
    (memberships ?? [])
      .map((row) => row.workspace_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  const deletedAt = new Date().toISOString();
  let total = 0;

  if (workspaceIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("user_notifications")
      .update({ deleted_at: deletedAt })
      .eq("recipient_user_id", authUser.id)
      .is("deleted_at", null)
      .in("workspace_id", workspaceIds)
      .select("id");
    if (error) return jsonResponse({ error: error.message }, 400);
    total += (data ?? []).length;
  }

  const { data: accountRows, error: accountError } = await supabaseAdmin
    .from("user_notifications")
    .update({ deleted_at: deletedAt })
    .eq("recipient_user_id", authUser.id)
    .is("deleted_at", null)
    .is("workspace_id", null)
    .select("id");
  if (accountError) return jsonResponse({ error: accountError.message }, 400);
  total += (accountRows ?? []).length;

  return jsonResponse({ success: true, updated: total });
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

  const action = payload.action;
  if (action === "markRead" || action === "markUnread" || action === "delete") {
    return handleUpdate(authResult.user, payload, action);
  }

  if (action === "markAllRead") {
    return handleMarkAllRead(authResult.user);
  }

  if (action === "markTaskRead") {
    return handleMarkTaskRead(authResult.user, payload);
  }

  if (action === "deleteAll") {
    return handleDeleteAll(authResult.user);
  }

  return jsonResponse({ error: "Unknown action" }, 400);
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
