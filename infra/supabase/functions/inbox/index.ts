import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createSupabaseClients, getProfileMap } from "../_shared/supabaseAuth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type InboxAction = "list";

interface InboxPayload {
  action?: InboxAction;
  limit?: number;
  pendingInviteLimit?: number;
  sentLimit?: number;
  includeSentUpdates?: boolean;
}

interface AuthInboxUser {
  id: string;
  email?: string | null;
}

type PendingInvite = {
  token: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  inviterDisplayName: string | null;
  inviterEmail: string | null;
};

type SentInviteSummary = {
  token: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  status: "pending" | "accepted" | "declined" | "canceled" | "expired";
  respondedAt: string | null;
};

type TaskNotification = {
  id: string;
  type: "task_assigned";
  workspaceId: string;
  workspaceName: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  taskId: string | null;
  taskTitle: string;
  taskStartDate: string | null;
  taskExists: boolean;
  createdAt: string;
  readAt: string | null;
};

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

const normalizeEmail = (value: string) => value.trim().toLowerCase();

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

const buildWorkspaceNameMap = async (workspaceIds: string[]) => {
  const uniqueIds = Array.from(new Set(workspaceIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { names: new Map<string, string>() };
  }

  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name")
    .in("id", uniqueIds);

  if (error) {
    return { error: error.message };
  }

  return {
    names: new Map(
      (data ?? [])
        .filter((row): row is { id: string; name: string } => typeof row.id === "string")
        .map((row) => [row.id, row.name ?? "Workspace"]),
    ),
  };
};

const loadPendingInvites = async (authUser: AuthInboxUser, limit: number) => {
  const userEmail = normalizeEmail(authUser.email ?? "");
  if (!userEmail) {
    return { invites: [] as PendingInvite[] };
  }

  const nowIso = new Date().toISOString();

  const { data: inviteRows, error: invitesError } = await supabaseAdmin
    .from("workspace_invites")
    .select("token, workspace_id, role, created_at, expires_at, invited_by")
    .eq("email_normalized", userEmail)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (invitesError) {
    return { error: invitesError.message };
  }

  const workspaceNameResult = await buildWorkspaceNameMap(
    (inviteRows ?? [])
      .map((invite) => invite.workspace_id)
      .filter((id): id is string => typeof id === "string"),
  );

  if ("error" in workspaceNameResult) {
    return { error: workspaceNameResult.error };
  }

  const inviterIds = Array.from(new Set(
    (inviteRows ?? [])
      .map((invite) => invite.invited_by)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  const inviterProfilesResult = await getProfileMap(supabaseAdmin, inviterIds);
  if ("error" in inviterProfilesResult) {
    return { error: inviterProfilesResult.error };
  }

  const invites = (inviteRows ?? []).map((invite) => {
    const inviter = inviterProfilesResult.profiles.get(invite.invited_by);
    return {
      token: invite.token,
      workspaceId: invite.workspace_id,
      workspaceName: workspaceNameResult.names.get(invite.workspace_id) ?? "Workspace",
      role: invite.role,
      inviterDisplayName: inviter?.displayName ?? null,
      inviterEmail: inviter?.email ?? null,
    };
  });

  return { invites };
};

const loadSentInviteUpdates = async (authUser: AuthInboxUser, limit: number) => {
  const createdSinceIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: inviteRows, error: invitesError } = await supabaseAdmin
    .from("workspace_invites")
    .select("token, workspace_id, email, role, created_at, expires_at, accepted_at, revoked_at, revoked_reason")
    .eq("invited_by", authUser.id)
    .gte("created_at", createdSinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (invitesError) {
    return { error: invitesError.message };
  }

  const workspaceNameResult = await buildWorkspaceNameMap(
    (inviteRows ?? [])
      .map((invite) => invite.workspace_id)
      .filter((id): id is string => typeof id === "string"),
  );

  if ("error" in workspaceNameResult) {
    return { error: workspaceNameResult.error };
  }

  const sentInvites: SentInviteSummary[] = (inviteRows ?? []).map((invite) => {
    const revokedReason = typeof invite.revoked_reason === "string" ? invite.revoked_reason : null;
    let status: SentInviteSummary["status"] = "pending";
    let respondedAt: string | null = null;

    if (invite.accepted_at) {
      status = "accepted";
      respondedAt = invite.accepted_at;
    } else if (invite.revoked_at) {
      status = revokedReason === "declined"
        ? "declined"
        : revokedReason === "expired"
          ? "expired"
          : "canceled";
      respondedAt = invite.revoked_at;
    } else if (new Date(invite.expires_at).getTime() <= Date.now()) {
      status = "expired";
      respondedAt = invite.expires_at;
    }

    return {
      token: invite.token,
      workspaceId: invite.workspace_id,
      workspaceName: workspaceNameResult.names.get(invite.workspace_id) ?? "Workspace",
      email: invite.email,
      status,
      respondedAt,
    };
  });

  return { sentInvites };
};

const loadTaskNotifications = async (authUser: AuthInboxUser, limit: number) => {
  const { data: rows, error } = await supabaseAdmin
    .from("user_notifications")
    .select("id, workspace_id, actor_user_id, type, task_id, task_title_snapshot, task_start_date_snapshot, created_at, read_at")
    .eq("recipient_user_id", authUser.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { error: error.message };
  }

  const workspaceIds = Array.from(new Set(
    (rows ?? [])
      .map((row) => row.workspace_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  const accessResult = await getWorkspaceAccessSet(workspaceIds, authUser.id);
  if ("error" in accessResult) {
    return { error: accessResult.error };
  }

  const visibleRows = (rows ?? []).filter((row) => accessResult.workspaceIds.has(row.workspace_id));

  const workspaceNameResult = await buildWorkspaceNameMap(
    visibleRows
      .map((row) => row.workspace_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  if ("error" in workspaceNameResult) {
    return { error: workspaceNameResult.error };
  }

  const actorIds = Array.from(new Set(
    visibleRows
      .map((row) => row.actor_user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  ));

  const profileResult = await getProfileMap(supabaseAdmin, actorIds);
  if ("error" in profileResult) {
    return { error: profileResult.error };
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
      return { error: taskError.message };
    }

    taskMap = new Map(
      (taskRows ?? [])
        .filter((row): row is { id: string; title: string | null; start_date: string | null } => typeof row.id === "string")
        .map((row) => [row.id, { title: row.title ?? null, startDate: row.start_date ?? null }]),
    );
  }

  const notifications: TaskNotification[] = visibleRows.map((row) => {
    const actorProfile = typeof row.actor_user_id === "string"
      ? profileResult.profiles.get(row.actor_user_id)
      : undefined;
    const taskState = typeof row.task_id === "string"
      ? taskMap.get(row.task_id)
      : undefined;

    return {
      id: row.id,
      type: "task_assigned",
      workspaceId: row.workspace_id,
      workspaceName: workspaceNameResult.names.get(row.workspace_id) ?? "Workspace",
      actorUserId: row.actor_user_id,
      actorDisplayName: actorProfile?.displayName ?? null,
      actorEmail: actorProfile?.email ?? null,
      taskId: row.task_id,
      taskTitle: taskState?.title ?? row.task_title_snapshot ?? "Untitled task",
      taskStartDate: taskState?.startDate ?? row.task_start_date_snapshot ?? null,
      taskExists: Boolean(taskState),
      createdAt: row.created_at,
      readAt: row.read_at,
    };
  });

  return { notifications };
};

const handleInboxList = async (
  authUser: AuthInboxUser,
  payload: InboxPayload,
) => {
  const requestedLimit = Number(payload.limit ?? 60);
  const requestedPendingLimit = Number(payload.pendingInviteLimit ?? 80);
  const requestedSentLimit = Number(payload.sentLimit ?? 120);

  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(200, Math.floor(requestedLimit)))
    : 60;
  const pendingInviteLimit = Number.isFinite(requestedPendingLimit)
    ? Math.max(1, Math.min(200, Math.floor(requestedPendingLimit)))
    : 80;
  const sentLimit = Number.isFinite(requestedSentLimit)
    ? Math.max(1, Math.min(400, Math.floor(requestedSentLimit)))
    : 120;

  const includeSentUpdates = payload.includeSentUpdates === true;

  const [pendingInvitesResult, taskNotificationsResult, sentInvitesResult] = await Promise.all([
    loadPendingInvites(authUser, pendingInviteLimit),
    loadTaskNotifications(authUser, limit),
    includeSentUpdates
      ? loadSentInviteUpdates(authUser, sentLimit)
      : Promise.resolve({ sentInvites: [] as SentInviteSummary[] }),
  ]);

  if ("error" in pendingInvitesResult) {
    return jsonResponse({ error: pendingInvitesResult.error }, 400);
  }

  if ("error" in taskNotificationsResult) {
    return jsonResponse({ error: taskNotificationsResult.error }, 400);
  }

  if ("error" in sentInvitesResult) {
    return jsonResponse({ error: sentInvitesResult.error }, 400);
  }

  return jsonResponse({
    success: true,
    invites: pendingInvitesResult.invites,
    notifications: taskNotificationsResult.notifications,
    sentInvites: sentInvitesResult.sentInvites,
    polledAt: new Date().toISOString(),
  });
};

const handleInbox = async (req: Request) => {
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

  const { data: payload, error } = await readJson<InboxPayload>(req);
  if (error) {
    return jsonResponse({ error }, 400);
  }

  const action = payload.action ?? "list";
  if (action !== "list") {
    return jsonResponse({ error: "Invalid action" }, 400);
  }

  return handleInboxList(authResult.user, payload);
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return handleInbox(req);
};

if (import.meta.main) {
  serve(handler);
}
