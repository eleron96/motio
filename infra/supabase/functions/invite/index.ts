import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import {
  APP_REALM_ROLES,
  type AppRealmRole,
  ensureKeycloakReady,
  findKeycloakUserByEmail,
  getKeycloakConfig,
  syncUserRealmRoles,
} from "../_shared/keycloak.ts";
import {
  createSupabaseClients,
  ensureKeycloakIdentityLink,
  findAuthUserByEmail,
  getRoleSnapshotMap,
  type WorkspaceRole,
} from "../_shared/supabaseAuth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/+$/, "");
const inviteTtlDays = Number(Deno.env.get("INVITE_TTL_DAYS") ?? "14");
const inviteTtlMs = Number.isFinite(inviteTtlDays) && inviteTtlDays > 0
  ? Math.floor(inviteTtlDays * 24 * 60 * 60 * 1000)
  : 14 * 24 * 60 * 60 * 1000;

const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const resendFrom = Deno.env.get("RESEND_FROM") ?? "Workspace <no-reply@example.com>";
const inviteRequireEmailDelivery = (Deno.env.get("INVITE_REQUIRE_EMAIL_DELIVERY") ?? "true")
  .trim()
  .toLowerCase() !== "false";

const keycloakConfig = getKeycloakConfig();
const keycloakIssuer = `${keycloakConfig.baseUrl}/realms/${keycloakConfig.realm}`;

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const workspaceRoleToRealmRole: Record<WorkspaceRole, AppRealmRole> = {
  viewer: "app_workspace_viewer",
  editor: "app_workspace_editor",
  admin: "app_workspace_admin",
};

interface InvitePayload {
  action?: "create" | "accept" | "list" | "decline" | "listSent" | "cancel";
  workspaceId?: string;
  email?: string;
  role?: WorkspaceRole;
  groupId?: string | null;
  token?: string;
  pendingOnly?: boolean;
}

interface AuthInviteUser {
  id: string;
  email?: string | null;
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

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const createInviteExpiryIso = () => new Date(Date.now() + inviteTtlMs).toISOString();

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

const sendInviteEmail = async (email: string, workspaceName: string, link: string) => {
  if (!resendApiKey) {
    return { sent: false, warning: "RESEND_API_KEY is not configured." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [email],
      subject: `You were invited to ${workspaceName}`,
      html: `
        <p>You were invited to join <strong>${workspaceName}</strong>.</p>
        <p>Open application: <a href="${link}">${link}</a></p>
        <p>Authentication is handled by Keycloak. Use your Keycloak account to sign in.</p>
      `,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { sent: false, warning: text || "Invite email failed." };
  }

  return { sent: true };
};

const buildDesiredRealmRoles = async (userId: string) => {
  const snapshotResult = await getRoleSnapshotMap(supabaseAdmin, [userId]);
  if ("error" in snapshotResult) {
    return { error: snapshotResult.error };
  }

  const snapshot = snapshotResult.roleMap.get(userId);
  const roles = new Set<AppRealmRole>();
  if (snapshot?.isSuperAdmin) {
    roles.add("app_super_admin");
  }
  snapshot?.workspaceRoles.forEach((role) => {
    roles.add(workspaceRoleToRealmRole[role]);
  });

  return { roles: Array.from(roles) };
};

const findExistingLinkedUserByEmail = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { error: "Email is required." };
  }

  const keycloakReady = ensureKeycloakReady(keycloakConfig);
  if ("error" in keycloakReady) {
    return { error: keycloakReady.error };
  }

  const keycloakResult = await findKeycloakUserByEmail(keycloakConfig, normalizedEmail);
  if ("error" in keycloakResult) {
    return { error: keycloakResult.error };
  }

  const authResult = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);
  if ("error" in authResult) {
    return { error: authResult.error };
  }

  if (!keycloakResult.user || !authResult.user) {
    return { missing: true };
  }

  const linkResult = await ensureKeycloakIdentityLink(
    supabaseAdmin,
    {
      supabaseUserId: authResult.user.id,
      email: normalizedEmail,
      keycloakUserId: keycloakResult.user.id,
      issuer: keycloakIssuer,
    },
  );

  if ("error" in linkResult) {
    return linkResult;
  }

  return {
    userId: authResult.user.id,
    email: normalizedEmail,
    keycloakUserId: keycloakResult.user.id,
  };
};

const ensureWorkspaceAdmin = async (workspaceId: string, userId: string) => {
  const { data: adminMembership, error: membershipError } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || adminMembership?.role !== "admin") {
    return { error: "Forbidden" };
  }

  return {};
};

const handleCreateInvite = async (
  authUser: AuthInviteUser,
  payload: InvitePayload,
) => {
  const workspaceId = payload.workspaceId?.trim();
  const email = payload.email ? normalizeEmail(payload.email) : "";
  const role = payload.role ?? "viewer";
  const groupId = payload.groupId?.trim() || null;

  if (!workspaceId || !email) {
    return jsonResponse({ error: "workspaceId and email are required" }, 400);
  }

  if (!["viewer", "editor", "admin"].includes(role)) {
    return jsonResponse({ error: "Invalid role" }, 400);
  }

  const adminCheck = await ensureWorkspaceAdmin(workspaceId, authUser.id);
  if ("error" in adminCheck) {
    return jsonResponse({ error: adminCheck.error }, 403);
  }

  const { data: workspace } = await supabaseAdmin
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();

  if (groupId) {
    const { data: group, error: groupError } = await supabaseAdmin
      .from("member_groups")
      .select("id")
      .eq("id", groupId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (groupError || !group) {
      return jsonResponse({ error: "Group not found." }, 400);
    }
  }

  const linked = await findExistingLinkedUserByEmail(email);
  if ("error" in linked) {
    return jsonResponse({ error: linked.error }, 400);
  }
  if ("missing" in linked && linked.missing) {
    await supabaseAdmin
      .from("workspace_invites")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: "canceled" })
      .eq("workspace_id", workspaceId)
      .eq("email_normalized", email)
      .is("accepted_at", null)
      .is("revoked_at", null);

    return jsonResponse({
      error: "User with this email is not registered yet. Ask them to sign in first, then send invite again.",
    }, 404);
  }

  const { data: existingMembership } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", linked.userId)
    .maybeSingle();

  if (existingMembership) {
    return jsonResponse({
      success: true,
      warning: "User already has access to this workspace.",
    });
  }

  const warnings: string[] = [];

  const nowIso = new Date().toISOString();
  const expiresAt = createInviteExpiryIso();

  const { error: revokeExpiredError } = await supabaseAdmin
    .from("workspace_invites")
    .update({ revoked_at: nowIso, revoked_reason: "expired" })
    .eq("workspace_id", workspaceId)
    .eq("email_normalized", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .lt("expires_at", nowIso);

  if (revokeExpiredError) {
    return jsonResponse({ error: revokeExpiredError.message }, 400);
  }

  const { data: existingInvite, error: existingInviteError } = await supabaseAdmin
    .from("workspace_invites")
    .select("id, token")
    .eq("workspace_id", workspaceId)
    .eq("email_normalized", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingInviteError) {
    return jsonResponse({ error: existingInviteError.message }, 400);
  }

  let inviteToken = "";
  let inviteCreatedInThisRequest = false;
  if (existingInvite?.id) {
    const { error: inviteUpdateError } = await supabaseAdmin
      .from("workspace_invites")
      .update({
        role,
        group_id: groupId,
        invited_by: authUser.id,
        expires_at: expiresAt,
      })
      .eq("id", existingInvite.id);

    if (inviteUpdateError) {
      return jsonResponse({ error: inviteUpdateError.message }, 400);
    }
    inviteToken = existingInvite.token;
  } else {
    const { data: insertedInvite, error: inviteInsertError } = await supabaseAdmin
      .from("workspace_invites")
      .insert({
        workspace_id: workspaceId,
        email,
        email_normalized: email,
        role,
        group_id: groupId,
        invited_by: authUser.id,
        expires_at: expiresAt,
      })
      .select("token")
      .single();

    if (inviteInsertError) {
      const { data: racedInvite, error: racedInviteError } = await supabaseAdmin
        .from("workspace_invites")
        .select("id, token")
        .eq("workspace_id", workspaceId)
        .eq("email_normalized", email)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (racedInviteError || !racedInvite?.id) {
        return jsonResponse({ error: inviteInsertError.message }, 400);
      }

      const { error: racedUpdateError } = await supabaseAdmin
        .from("workspace_invites")
        .update({
          role,
          group_id: groupId,
          invited_by: authUser.id,
          expires_at: expiresAt,
        })
        .eq("id", racedInvite.id);

      if (racedUpdateError) {
        return jsonResponse({ error: racedUpdateError.message }, 400);
      }

      inviteToken = racedInvite.token;
    } else {
      inviteToken = insertedInvite?.token ?? "";
      inviteCreatedInThisRequest = true;
    }
  }

  if (!inviteToken) {
    return jsonResponse({ error: "Failed to generate invite token." }, 500);
  }

  const inviteLink = `${appUrl}/invite/${inviteToken}`;
  const workspaceName = workspace?.name ?? "workspace";
  const emailResult = await sendInviteEmail(email, workspaceName, inviteLink);
  if (!emailResult.sent) {
    if (inviteRequireEmailDelivery) {
      if (inviteCreatedInThisRequest) {
        await supabaseAdmin
          .from("workspace_invites")
          .update({ revoked_at: new Date().toISOString(), revoked_reason: "canceled" })
          .eq("token", inviteToken)
          .is("accepted_at", null)
          .is("revoked_at", null);
      }
      return jsonResponse({
        error: emailResult.warning ?? "Failed to send invite email.",
      }, 503);
    }
    if (emailResult.warning) {
      warnings.push(emailResult.warning);
    }
  }

  return jsonResponse({
    success: true,
    actionLink: inviteLink,
    inviteEmail: email,
    inviteStatus: "pending",
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
  });
};

const handleAcceptInvite = async (
  authUser: AuthInviteUser,
  payload: InvitePayload,
) => {
  const token = payload.token?.trim() ?? "";
  if (!token) {
    return jsonResponse({ error: "Invite token is required." }, 400);
  }

  const userEmail = normalizeEmail(authUser.email ?? "");
  if (!userEmail) {
    return jsonResponse({ error: "Authenticated user email is missing." }, 400);
  }

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("workspace_invites")
    .select("id, workspace_id, email_normalized, role, group_id, expires_at, accepted_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError) {
    return jsonResponse({ error: inviteError.message }, 400);
  }

  if (!invite) {
    return jsonResponse({ error: "Invite not found." }, 404);
  }

  if (invite.revoked_at) {
    return jsonResponse({ error: "Invite is no longer valid." }, 400);
  }

  if (invite.accepted_at) {
    const { data: existingMembership } = await supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", invite.workspace_id)
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (existingMembership) {
      return jsonResponse({ success: true, workspaceId: invite.workspace_id });
    }
    return jsonResponse({ error: "Invite already accepted." }, 400);
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin
      .from("workspace_invites")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: "expired" })
      .eq("id", invite.id)
      .is("revoked_at", null);
    return jsonResponse({ error: "Invite expired." }, 400);
  }

  if (invite.email_normalized !== userEmail) {
    return jsonResponse({ error: "This invite belongs to a different email." }, 403);
  }

  let resolvedGroupId = invite.group_id as string | null;
  if (resolvedGroupId) {
    const { data: group, error: groupError } = await supabaseAdmin
      .from("member_groups")
      .select("id")
      .eq("id", resolvedGroupId)
      .eq("workspace_id", invite.workspace_id)
      .maybeSingle();
    if (groupError || !group) {
      resolvedGroupId = null;
    }
  }

  const { error: membershipInsertError } = await supabaseAdmin
    .from("workspace_members")
    .upsert({
      workspace_id: invite.workspace_id,
      user_id: authUser.id,
      role: invite.role as WorkspaceRole,
      group_id: resolvedGroupId,
    });

  if (membershipInsertError) {
    return jsonResponse({ error: membershipInsertError.message }, 400);
  }

  const { error: acceptedUpdateError } = await supabaseAdmin
    .from("workspace_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("accepted_at", null);

  if (acceptedUpdateError) {
    return jsonResponse({ error: acceptedUpdateError.message }, 400);
  }

  const warnings: string[] = [];
  const linkedSelf = await findExistingLinkedUserByEmail(userEmail);
  if (
    "error" in linkedSelf
    || ("missing" in linkedSelf && linkedSelf.missing)
    || linkedSelf.userId !== authUser.id
  ) {
    warnings.push("Role sync skipped for this invite acceptance.");
  } else {
    const desiredRolesResult = await buildDesiredRealmRoles(linkedSelf.userId);
    if ("error" in desiredRolesResult) {
      warnings.push(`Role sync skipped: ${desiredRolesResult.error}`);
    } else {
      const roleSyncResult = await syncUserRealmRoles(
        keycloakConfig,
        linkedSelf.keycloakUserId,
        desiredRolesResult.roles,
        APP_REALM_ROLES,
      );
      if ("error" in roleSyncResult) {
        warnings.push(`Role sync skipped: ${roleSyncResult.error}`);
      }
    }
  }

  return jsonResponse({
    success: true,
    workspaceId: invite.workspace_id,
    warning: warnings.length > 0 ? warnings.join(" ") : undefined,
  });
};

const handleListInvites = async (authUser: AuthInviteUser) => {
  const userEmail = normalizeEmail(authUser.email ?? "");
  if (!userEmail) {
    return jsonResponse({ error: "Authenticated user email is missing." }, 400);
  }

  const nowIso = new Date().toISOString();
  const { error: revokeExpiredError } = await supabaseAdmin
    .from("workspace_invites")
    .update({ revoked_at: nowIso, revoked_reason: "expired" })
    .eq("email_normalized", userEmail)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .lt("expires_at", nowIso);

  if (revokeExpiredError) {
    return jsonResponse({ error: revokeExpiredError.message }, 400);
  }

  const { data: inviteRows, error: invitesError } = await supabaseAdmin
    .from("workspace_invites")
    .select("token, workspace_id, role, created_at, expires_at, invited_by")
    .eq("email_normalized", userEmail)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (invitesError) {
    return jsonResponse({ error: invitesError.message }, 400);
  }

  const workspaceIds = Array.from(
    new Set(
      (inviteRows ?? [])
        .map((invite) => invite.workspace_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const inviterIds = Array.from(
    new Set(
      (inviteRows ?? [])
        .map((invite) => invite.invited_by)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  let workspaceNameMap = new Map<string, string>();
  if (workspaceIds.length > 0) {
    const { data: workspaceRows, error: workspaceError } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds);
    if (workspaceError) {
      return jsonResponse({ error: workspaceError.message }, 400);
    }
    workspaceNameMap = new Map(
      (workspaceRows ?? [])
        .filter((row): row is { id: string; name: string } => typeof row.id === "string")
        .map((row) => [row.id, row.name ?? "Workspace"]),
    );
  }

  let inviterMap = new Map<string, { display_name: string | null; email: string | null }>();
  if (inviterIds.length > 0) {
    const { data: inviterRows, error: inviterError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", inviterIds);
    if (inviterError) {
      return jsonResponse({ error: inviterError.message }, 400);
    }
    inviterMap = new Map(
      (inviterRows ?? [])
        .filter((row): row is { id: string; display_name: string | null; email: string | null } => (
          typeof row.id === "string"
        ))
        .map((row) => [row.id, { display_name: row.display_name ?? null, email: row.email ?? null }]),
    );
  }

  const invites = (inviteRows ?? []).map((invite) => {
    const inviter = inviterMap.get(invite.invited_by);
    return {
      token: invite.token,
      workspaceId: invite.workspace_id,
      workspaceName: workspaceNameMap.get(invite.workspace_id) ?? "Workspace",
      role: invite.role,
      inviterDisplayName: inviter?.display_name ?? null,
      inviterEmail: inviter?.email ?? null,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
    };
  });

  return jsonResponse({ success: true, invites });
};

const handleDeclineInvite = async (
  authUser: AuthInviteUser,
  payload: InvitePayload,
) => {
  const token = payload.token?.trim() ?? "";
  if (!token) {
    return jsonResponse({ error: "Invite token is required." }, 400);
  }

  const userEmail = normalizeEmail(authUser.email ?? "");
  if (!userEmail) {
    return jsonResponse({ error: "Authenticated user email is missing." }, 400);
  }

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("workspace_invites")
    .select("id, email_normalized, accepted_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError) {
    return jsonResponse({ error: inviteError.message }, 400);
  }

  if (!invite) {
    return jsonResponse({ error: "Invite not found." }, 404);
  }

  if (invite.email_normalized !== userEmail) {
    return jsonResponse({ error: "This invite belongs to a different email." }, 403);
  }

  if (invite.accepted_at) {
    return jsonResponse({ error: "Invite already accepted." }, 400);
  }

  if (invite.revoked_at) {
    return jsonResponse({ success: true });
  }

  const { error: revokeError } = await supabaseAdmin
    .from("workspace_invites")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "declined" })
    .eq("id", invite.id)
    .is("revoked_at", null);

  if (revokeError) {
    return jsonResponse({ error: revokeError.message }, 400);
  }

  return jsonResponse({ success: true });
};

const handleListSentInvites = async (authUser: AuthInviteUser, payload: InvitePayload) => {
  const nowIso = new Date().toISOString();
  const createdSinceIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const pendingOnly = payload.pendingOnly === true;

  const query = supabaseAdmin
    .from("workspace_invites")
    .select("token, workspace_id, email, role, created_at, expires_at, accepted_at, revoked_at, revoked_reason")
    .eq("invited_by", authUser.id)
    .gte("created_at", createdSinceIso)
    .order("created_at", { ascending: false });

  const { data: inviteRows, error: invitesError } = await (pendingOnly
    ? query
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
    : query);

  if (invitesError) {
    return jsonResponse({ error: invitesError.message }, 400);
  }

  const workspaceIds = Array.from(
    new Set(
      (inviteRows ?? [])
        .map((invite) => invite.workspace_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  let workspaceNameMap = new Map<string, string>();
  if (workspaceIds.length > 0) {
    const { data: workspaceRows, error: workspaceError } = await supabaseAdmin
      .from("workspaces")
      .select("id, name")
      .in("id", workspaceIds);
    if (workspaceError) {
      return jsonResponse({ error: workspaceError.message }, 400);
    }
    workspaceNameMap = new Map(
      (workspaceRows ?? [])
        .filter((row): row is { id: string; name: string } => typeof row.id === "string")
        .map((row) => [row.id, row.name ?? "Workspace"]),
    );
  }

  const invites = (inviteRows ?? []).map((invite) => {
    const revokedReason = typeof invite.revoked_reason === "string" ? invite.revoked_reason : null;
    let status: "pending" | "accepted" | "declined" | "canceled" | "expired" = "pending";
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

    const isPending = status === "pending" && invite.expires_at > nowIso;

    return {
      token: invite.token,
      workspaceId: invite.workspace_id,
      workspaceName: workspaceNameMap.get(invite.workspace_id) ?? "Workspace",
      email: invite.email,
      role: invite.role,
      status,
      isPending,
      createdAt: invite.created_at,
      respondedAt,
      expiresAt: invite.expires_at,
    };
  });

  return jsonResponse({ success: true, invites });
};

const handleCancelInvite = async (
  authUser: AuthInviteUser,
  payload: InvitePayload,
) => {
  const token = payload.token?.trim() ?? "";
  if (!token) {
    return jsonResponse({ error: "Invite token is required." }, 400);
  }

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("workspace_invites")
    .select("id, invited_by, accepted_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError) {
    return jsonResponse({ error: inviteError.message }, 400);
  }

  if (!invite) {
    return jsonResponse({ error: "Invite not found." }, 404);
  }

  if (invite.invited_by !== authUser.id) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  if (invite.accepted_at) {
    return jsonResponse({ error: "Invite already accepted." }, 400);
  }

  if (invite.revoked_at) {
    return jsonResponse({ success: true });
  }

  const { error: revokeError } = await supabaseAdmin
    .from("workspace_invites")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "canceled" })
    .eq("id", invite.id)
    .is("revoked_at", null);

  if (revokeError) {
    return jsonResponse({ error: revokeError.message }, 400);
  }

  return jsonResponse({ success: true });
};

const handleInvite = async (req: Request) => {
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

  const { data: payload, error } = await readJson<InvitePayload>(req);
  if (error) {
    return jsonResponse({ error }, 400);
  }

  const action = payload.action ?? "create";
  if (action === "accept") {
    return handleAcceptInvite(authResult.user, payload);
  }
  if (action === "list") {
    return handleListInvites(authResult.user);
  }
  if (action === "listSent") {
    return handleListSentInvites(authResult.user, payload);
  }
  if (action === "decline") {
    return handleDeclineInvite(authResult.user, payload);
  }
  if (action === "cancel") {
    return handleCancelInvite(authResult.user, payload);
  }

  return handleCreateInvite(authResult.user, payload);
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return handleInvite(req);
};

if (import.meta.main) {
  serve(handler);
}
