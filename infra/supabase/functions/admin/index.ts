import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { ADMIN_ACTIONS } from "../_shared/actions.ts";
import { captureException } from "../_shared/sentryCapture.ts";
import { buildUnsubscribeUrl, getMailerConfig, sendEmail } from "../_shared/mailer.ts";
import { renderBroadcastEmail } from "../_shared/broadcastEmail.ts";
import {
  APP_REALM_ROLES,
  type AppRealmRole,
  ensureKeycloakReady,
  ensureKeycloakUser,
  ensureRealmRoles,
  getUserRealmRoles,
  getKeycloakConfig,
  sendKeycloakExecuteActionsEmail,
  setKeycloakUserPassword,
  syncUserRealmRoles,
} from "../_shared/keycloak.ts";
import {
  createSupabaseClients,
  ensureKeycloakIdentityLink,
  ensureProfileDisplayName,
  ensureSupabaseUserByEmail,
  findAuthUserByEmail,
  findKeycloakIdentityForUser,
  getProfileMap,
  getRoleSnapshotMap,
  listAllAuthUsers,
  type RoleSnapshot,
  type WorkspaceRole,
} from "../_shared/supabaseAuth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const appUrl = Deno.env.get("APP_URL") ?? "";

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const reserveAdminEmail = (Deno.env.get("RESERVE_ADMIN_EMAIL") ?? "").trim().toLowerCase();
const reserveAdminPassword = Deno.env.get("RESERVE_ADMIN_PASSWORD") ?? "";

const keycloakConfig = getKeycloakConfig();
const keycloakIssuer = `${keycloakConfig.baseUrl}/realms/${keycloakConfig.realm}`;

let reserveAdminSynced = false;
let keycloakMigrationDone = false;

const workspaceRoleToRealmRole: Record<WorkspaceRole, AppRealmRole> = {
  viewer: "app_workspace_viewer",
  editor: "app_workspace_editor",
  admin: "app_workspace_admin",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const adminRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal(ADMIN_ACTIONS.BOOTSTRAP_SYNC),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.USERS_LIST),
    search: z.string().optional(),
    page: z.number().int().positive().optional(),
    perPage: z.number().int().positive().optional(),
    loadAll: z.boolean().optional(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.USERS_CREATE),
    email: z.string().email().optional(),
    displayName: z.string().optional(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.USERS_UPDATE),
    userId: z.string().optional(),
    email: z.string().email().optional(),
    displayName: z.string().optional(),
    superAdmin: z.boolean().optional(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.USERS_RESET_PASSWORD),
    userId: z.string().optional(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.USERS_DELETE),
    userId: z.string().optional(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.WORKSPACES_LIST),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.WORKSPACES_UPDATE),
    workspaceId: z.string().min(1),
    name: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.WORKSPACES_DELETE),
    workspaceId: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.SUPER_ADMINS_LIST),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.SUPER_ADMINS_CREATE),
    email: z.string().email(),
    displayName: z.string().optional(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.SUPER_ADMINS_WHOAMI),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.SUPER_ADMINS_DELETE),
    userId: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.KEYCLOAK_SYNC),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.EASTER_EGGS_LIST),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.EASTER_EGGS_SAVE),
    id: z.string().uuid().optional(),
    userId: z.string().uuid(),
    eggKey: z.string().min(1).max(64),
    enabled: z.boolean(),
    note: z.string().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.EASTER_EGGS_DELETE),
    id: z.string().uuid(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.BROADCASTS_AUDIENCE),
    messageType: z.enum(["announcement", "service"]),
    audienceKind: z.enum(["subscribers", "domain", "workspace", "all_active"]),
    audienceValue: z.string().max(255).optional(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.BROADCASTS_SEND),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(10000),
    messageType: z.enum(["announcement", "service"]),
    audienceKind: z.enum(["subscribers", "domain", "workspace", "all_active"]),
    audienceValue: z.string().max(255).optional(),
    scheduledAt: z.string().datetime().optional(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.BROADCASTS_PROCESS),
    broadcastId: z.string().uuid(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.BROADCASTS_LIST),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.BROADCASTS_CANCEL),
    broadcastId: z.string().uuid(),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.BROADCASTS_TICK),
  }).strict(),
]);

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

// Keycloak is the source of truth for super-admin access: the realm role
// app_super_admin decides, and the super_admins table is only a synced cache.
// Fail closed: when Keycloak cannot be consulted for a Keycloak-backed user,
// access is denied rather than trusted from the cache. The one exception is
// the break-glass reserve admin — a password-based GoTrue user with no
// Keycloak identity — whose access comes from the table and is alerted on.
const ensureSuperAdmin = async (userId: string) => {
  const { data: superAdminRow, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  const inTable = Boolean(superAdminRow && !error);

  const identityResult = await findKeycloakIdentityForUser(supabaseAdmin, userId);
  if ("error" in identityResult) {
    captureException(new Error(`super-admin check failed to read identities: ${identityResult.error}`), {
      tags: { function: "admin", stage: "ensure-super-admin" },
    });
    return false;
  }

  const providerId = identityResult.identity?.providerId;
  if (!providerId) {
    if (inTable) {
      captureException(new Error("break-glass super-admin access used (no Keycloak identity)"), {
        tags: { function: "admin", stage: "break-glass-access" },
      });
    }
    return inTable;
  }

  const keycloakReady = ensureKeycloakReady(keycloakConfig);
  if ("error" in keycloakReady) {
    captureException(new Error(`super-admin check denied: Keycloak not configured: ${keycloakReady.error}`), {
      tags: { function: "admin", stage: "ensure-super-admin" },
    });
    return false;
  }

  const keycloakRoles = await getUserRealmRoles(keycloakConfig, providerId);
  if ("error" in keycloakRoles) {
    captureException(new Error(`super-admin check denied: Keycloak unavailable: ${keycloakRoles.error}`), {
      tags: { function: "admin", stage: "ensure-super-admin" },
    });
    return false;
  }

  const hasSuperAdminRole = (keycloakRoles.roles ?? []).some((role) => role.name === "app_super_admin");

  if (hasSuperAdminRole) {
    if (!inTable) {
      await supabaseAdmin.from("super_admins").upsert({ user_id: userId });
    }
    return true;
  }

  if (inTable) {
    await supabaseAdmin.from("super_admins").delete().eq("user_id", userId);
  }

  return false;
};

const listSuperAdminIds = async () => {
  const { data, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id");

  if (error) {
    return { error: error.message, userIds: [] as string[] };
  }

  return {
    userIds: (data ?? []).map((row) => row.user_id),
  };
};

const buildDesiredRealmRoles = (snapshot: RoleSnapshot | undefined) => {
  const roles = new Set<AppRealmRole>();
  if (!snapshot) return Array.from(roles);

  if (snapshot.isSuperAdmin) {
    roles.add("app_super_admin");
  }

  snapshot.workspaceRoles.forEach((role) => {
    const mapped = workspaceRoleToRealmRole[role];
    if (mapped) roles.add(mapped);
  });

  return Array.from(roles);
};

const resolveLinkedUserByEmail = async (
  email: string,
  displayName?: string | null,
  options?: { sendSetupEmail?: boolean },
) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { error: "Email is required." };
  }

  const keycloakReady = ensureKeycloakReady(keycloakConfig);
  if ("error" in keycloakReady) {
    return { error: keycloakReady.error };
  }

  const ensuredRoles = await ensureRealmRoles(keycloakConfig, APP_REALM_ROLES);
  if ("error" in ensuredRoles) {
    return { error: ensuredRoles.error };
  }

  const keycloakResult = await ensureKeycloakUser(keycloakConfig, {
    email: normalizedEmail,
    displayName,
    enabled: true,
    emailVerified: true,
    requiredActions: ["UPDATE_PASSWORD"],
  });

  if ("error" in keycloakResult || !keycloakResult.user) {
    return { error: "error" in keycloakResult ? keycloakResult.error : "Failed to resolve Keycloak user." };
  }

  const authResult = await ensureSupabaseUserByEmail(supabaseAdmin, normalizedEmail);
  if ("error" in authResult || !authResult.user) {
    return { error: "error" in authResult ? authResult.error : "Failed to resolve Supabase user." };
  }

  const identityResult = await ensureKeycloakIdentityLink(
    supabaseAdmin,
    {
      supabaseUserId: authResult.user.id,
      email: normalizedEmail,
      displayName,
      keycloakUserId: keycloakResult.user.id,
      issuer: keycloakIssuer,
    },
  );

  if ("error" in identityResult) {
    return identityResult;
  }

  if (displayName !== undefined) {
    const displayNameResult = await ensureProfileDisplayName(supabaseAdmin, authResult.user.id, displayName);
    if ("error" in displayNameResult) {
      return displayNameResult;
    }
  }

  let warning: string | null = null;
  if (options?.sendSetupEmail && keycloakResult.created) {
    const setupResult = await sendKeycloakExecuteActionsEmail(keycloakConfig, keycloakResult.user.id, ["UPDATE_PASSWORD"]);
    if ("error" in setupResult) {
      warning = `User created, but Keycloak setup email failed: ${setupResult.error}`;
    }
  }

  return {
    userId: authResult.user.id,
    email: normalizedEmail,
    keycloakUserId: keycloakResult.user.id,
    keycloakCreated: keycloakResult.created,
    supabaseCreated: authResult.created,
    warning,
  };
};

const syncUserRoles = async (userId: string, keycloakUserId?: string | null) => {
  const keycloakReady = ensureKeycloakReady(keycloakConfig);
  if ("error" in keycloakReady) {
    return { error: keycloakReady.error };
  }

  const snapshotResult = await getRoleSnapshotMap(supabaseAdmin, [userId]);
  if ("error" in snapshotResult) {
    return { error: snapshotResult.error };
  }

  let resolvedKeycloakUserId = keycloakUserId ?? null;
  if (!resolvedKeycloakUserId) {
    const identityResult = await findKeycloakIdentityForUser(supabaseAdmin, userId);
    if ("error" in identityResult) {
      return { error: identityResult.error };
    }
    resolvedKeycloakUserId = identityResult.identity?.providerId ?? null;
  }

  if (!resolvedKeycloakUserId) {
    const authUserResult = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUserResult.error || !authUserResult.data.user?.email) {
      return { error: authUserResult.error?.message ?? "Failed to resolve user for role sync." };
    }

    const profileResult = await getProfileMap(supabaseAdmin, [userId]);
    if ("error" in profileResult) {
      return { error: profileResult.error };
    }

    const linked = await resolveLinkedUserByEmail(
      authUserResult.data.user.email,
      profileResult.profiles.get(userId)?.displayName ?? null,
    );
    if ("error" in linked) {
      return { error: linked.error };
    }
    resolvedKeycloakUserId = linked.keycloakUserId;
  }

  const desiredRoles = buildDesiredRealmRoles(snapshotResult.roleMap.get(userId));
  const syncResult = await syncUserRealmRoles(
    keycloakConfig,
    resolvedKeycloakUserId,
    desiredRoles,
    APP_REALM_ROLES,
  );

  if ("error" in syncResult) {
    return { error: syncResult.error };
  }

  return {
    added: syncResult.added,
    removed: syncResult.removed,
  };
};

const syncAllUsersToKeycloak = async () => {
  const keycloakReady = ensureKeycloakReady(keycloakConfig);
  if ("error" in keycloakReady) {
    return {
      fatalError: keycloakReady.error,
      summary: {
        processed: 0,
        createdKeycloakUsers: 0,
        createdSupabaseUsers: 0,
        roleAssignmentsUpdated: 0,
        warnings: [] as string[],
        errors: [] as string[],
      },
    };
  }

  const ensureRolesResult = await ensureRealmRoles(keycloakConfig, APP_REALM_ROLES);
  if ("error" in ensureRolesResult) {
    return {
      fatalError: ensureRolesResult.error,
      summary: {
        processed: 0,
        createdKeycloakUsers: 0,
        createdSupabaseUsers: 0,
        roleAssignmentsUpdated: 0,
        warnings: [] as string[],
        errors: [] as string[],
      },
    };
  }

  const listed = await listAllAuthUsers(supabaseAdmin);
  if ("error" in listed) {
    return {
      fatalError: listed.error,
      summary: {
        processed: 0,
        createdKeycloakUsers: 0,
        createdSupabaseUsers: 0,
        roleAssignmentsUpdated: 0,
        warnings: [] as string[],
        errors: [] as string[],
      },
    };
  }

  const users = listed.users.filter((user) => Boolean(user.email?.trim()));
  const profileResult = await getProfileMap(supabaseAdmin, users.map((user) => user.id));
  if ("error" in profileResult) {
    return {
      fatalError: profileResult.error,
      summary: {
        processed: 0,
        createdKeycloakUsers: 0,
        createdSupabaseUsers: 0,
        roleAssignmentsUpdated: 0,
        warnings: [] as string[],
        errors: [] as string[],
      },
    };
  }

  const roleMapResult = await getRoleSnapshotMap(supabaseAdmin, users.map((user) => user.id));
  if ("error" in roleMapResult) {
    return {
      fatalError: roleMapResult.error,
      summary: {
        processed: 0,
        createdKeycloakUsers: 0,
        createdSupabaseUsers: 0,
        roleAssignmentsUpdated: 0,
        warnings: [] as string[],
        errors: [] as string[],
      },
    };
  }

  const summary = {
    processed: 0,
    createdKeycloakUsers: 0,
    createdSupabaseUsers: 0,
    roleAssignmentsUpdated: 0,
    warnings: [] as string[],
    errors: [] as string[],
  };

  for (const user of users) {
    if (!user.email) continue;

    const profile = profileResult.profiles.get(user.id);
    const linked = await resolveLinkedUserByEmail(user.email, profile?.displayName ?? null);

    if ("error" in linked) {
      summary.errors.push(`User ${user.id}: ${linked.error}`);
      continue;
    }

    summary.processed += 1;
    if (linked.keycloakCreated) {
      summary.createdKeycloakUsers += 1;
    }
    if (linked.supabaseCreated) {
      summary.createdSupabaseUsers += 1;
    }
    if (linked.warning) {
      summary.warnings.push(`User ${linked.email}: ${linked.warning}`);
    }

    const desiredRoles = buildDesiredRealmRoles(roleMapResult.roleMap.get(user.id));
    const syncResult = await syncUserRealmRoles(
      keycloakConfig,
      linked.keycloakUserId,
      desiredRoles,
      APP_REALM_ROLES,
    );

    if ("error" in syncResult) {
      summary.errors.push(`Role sync failed for ${linked.email}: ${syncResult.error}`);
      continue;
    }

    if ((syncResult.added?.length ?? 0) + (syncResult.removed?.length ?? 0) > 0) {
      summary.roleAssignmentsUpdated += 1;
    }
  }

  return { summary };
};

const ensureReserveAdminAccount = async () => {
  if (!reserveAdminEmail || !reserveAdminPassword) {
    return { error: "RESERVE_ADMIN_EMAIL or RESERVE_ADMIN_PASSWORD is not configured." };
  }

  const linked = await resolveLinkedUserByEmail(
    reserveAdminEmail,
    "Reserve super admin",
    { sendSetupEmail: false },
  );
  if ("error" in linked) {
    return { error: linked.error };
  }

  const passwordResult = await setKeycloakUserPassword(
    keycloakConfig,
    linked.keycloakUserId,
    reserveAdminPassword,
    false,
  );
  if ("error" in passwordResult) {
    return { error: passwordResult.error };
  }

  const { error: membershipDelete } = await supabaseAdmin
    .from("workspace_members")
    .delete()
    .eq("user_id", linked.userId);
  if (membershipDelete) {
    return { error: membershipDelete.message };
  }

  const { error: superAdminInsertError } = await supabaseAdmin
    .from("super_admins")
    .upsert({ user_id: linked.userId });
  if (superAdminInsertError) {
    return { error: superAdminInsertError.message };
  }

  const roleSyncResult = await syncUserRoles(linked.userId, linked.keycloakUserId);
  if ("error" in roleSyncResult) {
    return { error: roleSyncResult.error };
  }

  return {
    userId: linked.userId,
    email: reserveAdminEmail,
    keycloakUserId: linked.keycloakUserId,
  };
};

const ensureReserveAdminOnce = async () => {
  if (reserveAdminSynced) return { ready: true };
  if (!reserveAdminEmail || !reserveAdminPassword) return { ready: true };

  const result = await ensureReserveAdminAccount();
  if ("error" in result) {
    console.error("Reserve admin setup failed:", result.error);
    return { error: result.error };
  }

  reserveAdminSynced = true;
  return { ready: true };
};

const ensureKeycloakMigrationOnce = async () => {
  if (keycloakMigrationDone) return { ready: true };

  const result = await syncAllUsersToKeycloak();

  if ("fatalError" in result && result.fatalError) {
    console.error("Keycloak migration failed:", result.fatalError);
    return { error: result.fatalError };
  }

  if (result.summary.errors.length > 0) {
    console.error("Keycloak migration completed with errors:", result.summary.errors);
  }

  keycloakMigrationDone = true;
  return {
    ready: true,
    summary: result.summary,
  };
};

const handleUsersList = async (payload: { search?: string }) => {
  const search = payload.search?.trim().toLowerCase() ?? "";

  const listed = await listAllAuthUsers(supabaseAdmin);
  if ("error" in listed) {
    return jsonResponse({ error: listed.error }, 500);
  }

  const { userIds: superAdminIds } = await listSuperAdminIds();
  const superAdminSet = new Set(superAdminIds);

  if (reserveAdminEmail) {
    const reserveUser = await findAuthUserByEmail(supabaseAdmin, reserveAdminEmail);
    if ("error" in reserveUser) {
      return jsonResponse({ error: reserveUser.error }, 500);
    }
    if (reserveUser.user?.id) {
      superAdminSet.add(reserveUser.user.id);
    }
  }

  const visibleUsers = listed.users.filter((user) => !superAdminSet.has(user.id));
  const userIds = visibleUsers.map((user) => user.id);

  if (userIds.length === 0) {
    return jsonResponse({ users: [], total: 0 });
  }

  const [
    { data: profiles, error: profilesError },
    { data: memberships, error: membershipsError },
    { data: ownedWorkspaces, error: ownedWorkspacesError },
    { data: taskMedia, error: taskMediaError },
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, display_name, email")
      .in("id", userIds),
    supabaseAdmin
      .from("workspace_members")
      .select("user_id, role, workspace_id, workspaces(id, name)")
      .in("user_id", userIds),
    supabaseAdmin
      .from("workspaces")
      .select("id, name, owner_id")
      .in("owner_id", userIds),
    supabaseAdmin
      .from("task_media")
      .select("owner_id, byte_size")
      .in("owner_id", userIds),
  ]);

  if (profilesError) {
    return jsonResponse({ error: profilesError.message }, 500);
  }
  if (membershipsError) {
    return jsonResponse({ error: membershipsError.message }, 500);
  }
  if (ownedWorkspacesError) {
    return jsonResponse({ error: ownedWorkspacesError.message }, 500);
  }
  if (taskMediaError) {
    return jsonResponse({ error: taskMediaError.message }, 500);
  }

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );

  const workspaceMap = new Map<string, Map<string, { id: string; name: string; role: string }>>();

  const upsertWorkspace = (
    userId: string,
    workspace: { id: string; name: string; role: string },
  ) => {
    const list = workspaceMap.get(userId) ?? new Map<string, { id: string; name: string; role: string }>();
    const existing = list.get(workspace.id);
    if (!existing) {
      list.set(workspace.id, workspace);
      workspaceMap.set(userId, list);
      return;
    }

    if (workspace.role === "owner") {
      existing.role = "owner";
    } else if (existing.role !== "owner") {
      existing.role = workspace.role;
    }
    existing.name = workspace.name || existing.name;
    list.set(workspace.id, existing);
    workspaceMap.set(userId, list);
  };

  (memberships ?? []).forEach((row) => {
    upsertWorkspace(row.user_id, {
      id: row.workspace_id,
      name: row.workspaces?.name ?? "Workspace",
      role: row.role,
    });
  });

  (ownedWorkspaces ?? []).forEach((row) => {
    upsertWorkspace(row.owner_id, {
      id: row.id,
      name: row.name ?? "Workspace",
      role: "owner",
    });
  });

  const mediaUsageByUser = new Map<string, { objectsCount: number; usedBytes: number }>();

  (taskMedia ?? []).forEach((row) => {
    const owner = typeof row.owner_id === "string" ? row.owner_id : "";
    if (!owner) return;

    const current = mediaUsageByUser.get(owner) ?? { objectsCount: 0, usedBytes: 0 };
    current.objectsCount += 1;
    current.usedBytes += typeof row.byte_size === "number" && Number.isFinite(row.byte_size)
      ? Math.max(0, Math.floor(row.byte_size))
      : 0;
    mediaUsageByUser.set(owner, current);
  });

  let result = visibleUsers.map((user) => {
    const profile = profileMap.get(user.id);
    const workspaceEntries = Array.from(workspaceMap.get(user.id)?.values() ?? []);
    workspaceEntries.sort((left, right) => left.name.localeCompare(right.name));
    const ownedWorkspaceCount = workspaceEntries.filter((workspace) => workspace.role === "owner").length;
    const managedWorkspaceCount = workspaceEntries.filter((workspace) => workspace.role === "owner" || workspace.role === "admin").length;
    const mediaUsage = mediaUsageByUser.get(user.id) ?? { objectsCount: 0, usedBytes: 0 };

    return {
      id: user.id,
      email: user.email ?? profile?.email ?? null,
      displayName: profile?.display_name ?? null,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      managedWorkspaceCount,
      ownedWorkspaceCount,
      workspaceCount: workspaceEntries.length,
      storageObjectsCount: mediaUsage.objectsCount,
      storageUsedBytes: mediaUsage.usedBytes,
      workspaces: workspaceEntries,
    };
  });

  if (search) {
    result = result.filter((item) => {
      const workspaceNames = item.workspaces.map((workspace) => workspace.name.toLowerCase());
      return (
        (item.email ?? "").toLowerCase().includes(search)
        || item.id.toLowerCase().includes(search)
        || (item.displayName ?? "").toLowerCase().includes(search)
        || workspaceNames.some((name) => name.includes(search))
      );
    });
  }

  return jsonResponse({ users: result, total: result.length });
};

const handleUsersCreate = async (_payload: { email?: string; displayName?: string }) => {
  return jsonResponse({ error: "User lifecycle operations are managed in Keycloak admin console." }, 400);
};

const handleUsersUpdate = async (_payload: { userId?: string; email?: string; displayName?: string; superAdmin?: boolean }) => {
  return jsonResponse({ error: "User lifecycle operations are managed in Keycloak admin console." }, 400);
};

const handleUsersResetPassword = async () => {
  return jsonResponse({ error: "Password reset is managed in Keycloak admin console." }, 400);
};

const handleUsersDelete = async (_payload: { userId?: string }, _currentUserId: string) => {
  return jsonResponse({ error: "User lifecycle operations are managed in Keycloak admin console." }, 400);
};

const handleWorkspacesList = async () => {
  const { data: workspaces, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, name, owner_id, created_at");
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id);
  const ownerIds = Array.from(new Set((workspaces ?? []).map((workspace) => workspace.owner_id)));

  if (workspaceIds.length === 0) {
    return jsonResponse({ workspaces: [] });
  }

  const [
    { data: members, error: membersError },
    { data: tasks, error: tasksError },
    { data: owners, error: ownersError },
  ] = await Promise.all([
    supabaseAdmin
      .from("workspace_members")
      .select("workspace_id")
      .in("workspace_id", workspaceIds),
    supabaseAdmin
      .from("tasks")
      .select("workspace_id")
      .in("workspace_id", workspaceIds),
    supabaseAdmin
      .from("profiles")
      .select("id, email, display_name")
      .in("id", ownerIds),
  ]);

  if (membersError) {
    return jsonResponse({ error: membersError.message }, 500);
  }
  if (tasksError) {
    return jsonResponse({ error: tasksError.message }, 500);
  }
  if (ownersError) {
    return jsonResponse({ error: ownersError.message }, 500);
  }

  const memberCounts = new Map<string, number>();
  (members ?? []).forEach((row) => {
    memberCounts.set(row.workspace_id, (memberCounts.get(row.workspace_id) ?? 0) + 1);
  });

  const taskCounts = new Map<string, number>();
  (tasks ?? []).forEach((row) => {
    taskCounts.set(row.workspace_id, (taskCounts.get(row.workspace_id) ?? 0) + 1);
  });

  const ownerMap = new Map(
    (owners ?? []).map((owner) => [owner.id, owner]),
  );

  const result = (workspaces ?? []).map((workspace) => {
    const owner = ownerMap.get(workspace.owner_id);
    return {
      id: workspace.id,
      name: workspace.name,
      ownerId: workspace.owner_id,
      ownerEmail: owner?.email ?? null,
      ownerDisplayName: owner?.display_name ?? null,
      membersCount: memberCounts.get(workspace.id) ?? 0,
      tasksCount: taskCounts.get(workspace.id) ?? 0,
      createdAt: workspace.created_at ?? null,
    };
  });

  return jsonResponse({ workspaces: result });
};

const handleWorkspacesUpdate = async (payload: { workspaceId?: string; name?: string }) => {
  const workspaceId = payload.workspaceId?.trim() ?? "";
  const name = payload.name?.trim() ?? "";
  if (!workspaceId || !name) {
    return jsonResponse({ error: "workspaceId and name are required" }, 400);
  }

  const { error } = await supabaseAdmin
    .from("workspaces")
    .update({ name })
    .eq("id", workspaceId);
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ success: true });
};

const handleWorkspacesDelete = async (payload: { workspaceId?: string }) => {
  const workspaceId = payload.workspaceId?.trim() ?? "";
  if (!workspaceId) {
    return jsonResponse({ error: "workspaceId is required" }, 400);
  }

  const { error } = await supabaseAdmin
    .from("workspaces")
    .delete()
    .eq("id", workspaceId);
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ success: true });
};

const handleSuperAdminsList = async () => {
  const { data, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id, created_at");
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const userIds = (data ?? []).map((row) => row.user_id);
  if (userIds.length === 0) {
    return jsonResponse({ superAdmins: [] });
  }

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, email, display_name")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile]),
  );

  const result = (data ?? []).map((row) => {
    const profile = profileMap.get(row.user_id);
    return {
      userId: row.user_id,
      email: profile?.email ?? null,
      displayName: profile?.display_name ?? null,
      createdAt: row.created_at ?? null,
    };
  });

  return jsonResponse({ superAdmins: result });
};

const handleSuperAdminsCreate = async () => {
  return jsonResponse({ error: "Super admin assignment is managed in Keycloak." }, 400);
};

const handleSuperAdminsDelete = async () => {
  return jsonResponse({ error: "Super admin assignment is managed in Keycloak." }, 400);
};

// ── Easter eggs: daily-brief overlays assigned per user. Effects live in the
// frontend catalog; these handlers only manage WHO gets WHICH key. The table
// enforces at most one ACTIVE egg per user (partial unique index), so enabling
// one first switches off the user's other active rows.
const handleEasterEggsList = async () => {
  const { data: rows, error } = await supabaseAdmin
    .from("easter_egg_targets")
    .select("id, egg_key, user_id, enabled, note, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  const userIds = Array.from(new Set((rows ?? []).map((row) => row.user_id)));
  const profileResult = await getProfileMap(supabaseAdmin, userIds);
  if ("error" in profileResult) {
    return jsonResponse({ error: profileResult.error }, 400);
  }

  const targets = (rows ?? []).map((row) => {
    const profile = profileResult.profiles.get(row.user_id);
    return {
      id: row.id,
      eggKey: row.egg_key,
      userId: row.user_id,
      userEmail: profile?.email ?? null,
      userDisplayName: profile?.displayName ?? null,
      enabled: row.enabled,
      note: row.note,
      createdAt: row.created_at,
    };
  });

  return jsonResponse({ targets });
};

const handleEasterEggsSave = async (
  payload: { id?: string; userId: string; eggKey: string; enabled: boolean; note?: string },
) => {
  if (payload.enabled) {
    let disableOthers = supabaseAdmin
      .from("easter_egg_targets")
      .update({ enabled: false })
      .eq("user_id", payload.userId)
      .eq("enabled", true);
    if (payload.id) {
      disableOthers = disableOthers.neq("id", payload.id);
    }
    const { error: disableError } = await disableOthers;
    if (disableError) {
      return jsonResponse({ error: disableError.message }, 400);
    }
  }

  if (payload.id) {
    const { error } = await supabaseAdmin
      .from("easter_egg_targets")
      .update({
        egg_key: payload.eggKey,
        enabled: payload.enabled,
        note: payload.note ?? null,
      })
      .eq("id", payload.id);
    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }
  } else {
    const { error } = await supabaseAdmin
      .from("easter_egg_targets")
      .insert({
        user_id: payload.userId,
        egg_key: payload.eggKey,
        enabled: payload.enabled,
        note: payload.note ?? null,
      });
    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }
  }

  return jsonResponse({ success: true });
};

const handleEasterEggsDelete = async (payload: { id: string }) => {
  const { error } = await supabaseAdmin
    .from("easter_egg_targets")
    .delete()
    .eq("id", payload.id);
  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }
  return jsonResponse({ success: true });
};


// ── Product broadcasts: opt-in announcement emails. The send action
// snapshots the audience into a queue; process works through it in small
// batches (the edge runtime has a request time budget, and the frontend
// keeps calling process until nothing is pending). Single-admin tool — no
// concurrent-claim machinery on the queue by design.
const BROADCAST_BATCH_SIZE = 25;

type BroadcastMessageType = "announcement" | "service";
type BroadcastAudienceKind = "subscribers" | "domain" | "workspace" | "all_active";
interface AudienceParams {
  messageType: BroadcastMessageType;
  audienceKind: BroadcastAudienceKind;
  audienceValue?: string;
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve a segment to recipient rows (id + email). Enforces the consent
// boundary in code: only announcements respect the marketing opt-in; service
// (transactional) mail goes to the whole ACTIVE segment. Returns an error
// string for a malformed segment value rather than silently emailing nobody
// or — worse — everybody.
const resolveBroadcastAudience = async (
  params: AudienceParams,
): Promise<{ recipients: Array<{ id: string; email: string }> } | { error: string }> => {
  const optInGate = params.messageType === "announcement";

  const finalize = (rows: Array<{ id: string; email: string | null }>) => ({
    recipients: rows
      .filter((row) => Boolean(row.email))
      .map((row) => ({ id: row.id, email: row.email as string })),
  });

  if (params.audienceKind === "workspace") {
    const workspaceId = (params.audienceValue ?? "").trim();
    if (!UUID_RE.test(workspaceId)) {
      return { error: "A valid workspace must be selected." };
    }
    const { data: memberRows, error: memberError } = await supabaseAdmin
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId);
    if (memberError) return { error: memberError.message };
    const userIds = Array.from(new Set((memberRows ?? []).map((row) => row.user_id)));
    if (userIds.length === 0) return { recipients: [] };

    let query = supabaseAdmin
      .from("profiles")
      .select("id, email")
      .in("id", userIds)
      .eq("status", "ACTIVE");
    if (optInGate) query = query.eq("marketing_emails_opt_in", true);
    const { data, error } = await query;
    if (error) return { error: error.message };
    return finalize(data ?? []);
  }

  let query = supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("status", "ACTIVE");

  // Consent gate is purely a function of message type: announcements always
  // respect the opt-in (every segment kind, including all_active which then
  // just equals "subscribers"); service mail never applies it.
  if (optInGate) {
    query = query.eq("marketing_emails_opt_in", true);
  }

  if (params.audienceKind === "domain") {
    const domain = (params.audienceValue ?? "").trim().replace(/^@/, "").toLowerCase();
    // Validated against a strict domain regex, so it cannot carry PostgREST
    // ilike metacharacters (%, _, comma) that would broaden the match.
    if (!DOMAIN_RE.test(domain)) {
      return { error: "Enter a valid email domain, e.g. example.com." };
    }
    query = query.ilike("email", `%@${domain}`);
  }

  // "subscribers" adds nothing beyond the opt-in gate above; "all_active"
  // (service only in practice) deliberately skips the gate.
  const { data, error } = await query;
  if (error) return { error: error.message };
  return finalize(data ?? []);
};

const handleBroadcastsAudience = async (payload: AudienceParams) => {
  const resolved = await resolveBroadcastAudience(payload);
  if ("error" in resolved) {
    return jsonResponse({ error: resolved.error }, 400);
  }
  return jsonResponse({ count: resolved.recipients.length });
};

// Snapshot the resolved audience into the queue. The broadcast row is already
// 'sending' by the time this runs (immediate send inserts it so; the ticker
// atomically promotes a due scheduled row before calling). Records
// total_recipients and finalizes an empty audience to 'sent'.
const queueBroadcastRecipients = async (
  broadcastId: string,
  params: AudienceParams,
): Promise<{ total: number } | { error: string }> => {
  const resolved = await resolveBroadcastAudience(params);
  if ("error" in resolved) {
    // Terminal: an unresolved audience must not leave the row stuck 'sending'
    // with an empty queue, which would jam the ticker's oldest-first pipeline.
    await supabaseAdmin
      .from("email_broadcasts")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", broadcastId);
    return { error: resolved.error };
  }
  const audience = resolved.recipients;

  if (audience.length === 0) {
    await supabaseAdmin
      .from("email_broadcasts")
      .update({ status: "sent", total_recipients: 0, finished_at: new Date().toISOString() })
      .eq("id", broadcastId);
    return { total: 0 };
  }

  const { error: queueError } = await supabaseAdmin
    .from("email_broadcast_recipients")
    .insert(audience.map((row) => ({
      broadcast_id: broadcastId,
      user_id: row.id,
      email: row.email,
    })));
  if (queueError) {
    await supabaseAdmin
      .from("email_broadcasts")
      .update({ status: "failed", finished_at: new Date().toISOString() })
      .eq("id", broadcastId);
    return { error: queueError.message };
  }

  await supabaseAdmin
    .from("email_broadcasts")
    .update({ total_recipients: audience.length })
    .eq("id", broadcastId);
  return { total: audience.length };
};

const handleBroadcastsSend = async (
  payload: {
    subject: string;
    body: string;
    messageType: BroadcastMessageType;
    audienceKind: BroadcastAudienceKind;
    audienceValue?: string;
    scheduledAt?: string;
  },
  actorId: string,
) => {
  // Scheduled for the future → store the intent; the ticker resolves the
  // audience and sends at fire time (kept fresh, and independent of the tab).
  const scheduledAtMs = payload.scheduledAt ? Date.parse(payload.scheduledAt) : NaN;
  const isScheduled = Number.isFinite(scheduledAtMs) && scheduledAtMs > Date.now() + 30_000;

  const { data: broadcast, error: insertError } = await supabaseAdmin
    .from("email_broadcasts")
    .insert({
      subject: payload.subject,
      body: payload.body,
      created_by: actorId,
      message_type: payload.messageType,
      audience_kind: payload.audienceKind,
      audience_value: payload.audienceValue ?? null,
      status: isScheduled ? "scheduled" : "sending",
      scheduled_at: isScheduled ? new Date(scheduledAtMs).toISOString() : null,
    })
    .select("id")
    .single();

  if (insertError || !broadcast) {
    return jsonResponse({ error: insertError?.message ?? "Failed to create broadcast" }, 400);
  }

  if (isScheduled) {
    return jsonResponse({ broadcastId: broadcast.id, scheduled: true });
  }

  const queued = await queueBroadcastRecipients(broadcast.id, payload);
  if ("error" in queued) {
    return jsonResponse({ error: queued.error }, 400);
  }
  return jsonResponse({ broadcastId: broadcast.id, total: queued.total });
};

const handleBroadcastsCancel = async (payload: { broadcastId: string }) => {
  const { data, error } = await supabaseAdmin
    .from("email_broadcasts")
    .update({ status: "canceled", finished_at: new Date().toISOString() })
    .eq("id", payload.broadcastId)
    .eq("status", "scheduled")
    .select("id")
    .maybeSingle();
  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }
  if (!data) {
    return jsonResponse({ error: "Only a scheduled broadcast can be canceled." }, 409);
  }
  return jsonResponse({ success: true });
};

// Cron entry point: promote due scheduled broadcasts into the queue, then
// process one batch of the oldest in-flight broadcast. This makes delivery
// independent of the admin tab and delivers scheduled sends.
const handleBroadcastsTick = async () => {
  const nowIso = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from("email_broadcasts")
    .select("id, message_type, audience_kind, audience_value")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(5);

  for (const row of due ?? []) {
    // Atomically claim the scheduled row before resolving its audience, so a
    // concurrent cancel (which requires status='scheduled') or another tick
    // cannot double-promote it. Only the winner queues recipients.
    const { data: promoted } = await supabaseAdmin
      .from("email_broadcasts")
      .update({ status: "sending" })
      .eq("id", row.id)
      .eq("status", "scheduled")
      .select("id")
      .maybeSingle();
    if (!promoted) continue;

    await queueBroadcastRecipients(row.id, {
      messageType: row.message_type as BroadcastMessageType,
      audienceKind: row.audience_kind as BroadcastAudienceKind,
      audienceValue: row.audience_value ?? undefined,
    });
  }

  const { data: inflight } = await supabaseAdmin
    .from("email_broadcasts")
    .select("id")
    .eq("status", "sending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (inflight) {
    return processBroadcastBatch(inflight.id);
  }
  return jsonResponse({ promoted: (due ?? []).length, processed: 0 });
};

const handleBroadcastsProcess = (payload: { broadcastId: string }) =>
  processBroadcastBatch(payload.broadcastId);

const processBroadcastBatch = async (broadcastId: string) => {
  // Atomically claim a batch (FOR UPDATE SKIP LOCKED, flips pending->sending):
  // the admin tab's loop and the cron ticker can run concurrently without ever
  // grabbing the same recipient, so nobody is emailed twice.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .rpc("claim_broadcast_recipients", { p_broadcast_id: broadcastId, p_limit: BROADCAST_BATCH_SIZE });

  if (claimError) {
    return jsonResponse({ error: claimError.message }, 400);
  }

  const batch = (claimed ?? []) as Array<{ id: string; user_id: string; email: string }>;

  if (batch.length > 0) {
    const { data: broadcast, error: broadcastError } = await supabaseAdmin
      .from("email_broadcasts")
      .select("subject, body, message_type")
      .eq("id", broadcastId)
      .single();
    if (broadcastError || !broadcast) {
      return jsonResponse({ error: broadcastError?.message ?? "Broadcast not found" }, 404);
    }

    // Service (transactional) mail carries no unsubscribe link or header —
    // only marketing announcements do.
    const isAnnouncement = broadcast.message_type !== "service";

    // Re-fetch each recipient's live consent + status: honoring an opt-out or
    // account deletion that happened AFTER the audience was snapshotted. Also
    // supplies the render locale.
    const profileOf = new Map<string, { locale: string; status: string; optIn: boolean }>();
    const { data: profileRows } = await supabaseAdmin
      .from("profiles")
      .select("id, locale, status, marketing_emails_opt_in")
      .in("id", batch.map((row) => row.user_id));
    (profileRows ?? []).forEach((row) => profileOf.set(row.id, {
      locale: row.locale,
      status: row.status,
      optIn: Boolean(row.marketing_emails_opt_in),
    }));

    const mailerConfig = getMailerConfig();

    for (const recipient of batch) {
      const profile = profileOf.get(recipient.user_id);
      const active = profile?.status === "ACTIVE";
      // Announcements must still be opted-in at send time; service mail only
      // requires an active account.
      const eligible = active && (!isAnnouncement || profile?.optIn === true);
      if (!eligible) {
        await supabaseAdmin
          .from("email_broadcast_recipients")
          .update({ status: "skipped" })
          .eq("id", recipient.id);
        continue;
      }

      const unsubscribeUrl = isAnnouncement
        ? await buildUnsubscribeUrl(appUrl, recipient.user_id)
        : null;
      const rendered = renderBroadcastEmail({
        locale: profile?.locale === "ru" ? "ru" : "en",
        messageType: isAnnouncement ? "announcement" : "service",
        subject: broadcast.subject,
        body: broadcast.body,
        unsubscribeUrl,
      });

      try {
        await sendEmail(mailerConfig, {
          to: recipient.email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          ...(unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` } } : {}),
        });
        await supabaseAdmin
          .from("email_broadcast_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", recipient.id);
      } catch (sendError) {
        await supabaseAdmin
          .from("email_broadcast_recipients")
          .update({ status: "failed", error: String(sendError).slice(0, 500) })
          .eq("id", recipient.id);
        captureException(sendError, { tags: { function: "admin", stage: "broadcast-send" } });
      }

      // Gentle pacing for the SMTP relay.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  const { count: sentCount } = await supabaseAdmin
    .from("email_broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("status", "sent");
  const { count: failedCount } = await supabaseAdmin
    .from("email_broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("status", "failed");
  // "Done" means nothing is pending AND nothing is mid-flight ('sending' left
  // by another concurrent processor) — so the last finisher marks it sent.
  const { count: unfinished } = await supabaseAdmin
    .from("email_broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .in("status", ["pending", "sending"]);
  // Guard against the window where a broadcast is already 'sending' but its
  // recipients haven't been inserted yet (send/promote commits the row before
  // queueBroadcastRecipients commits the queue). Never finalize an unpopulated
  // queue to 'sent' — a genuinely empty audience is finalized inside
  // queueBroadcastRecipients and never reaches this path as 'sending'.
  const { count: totalRows } = await supabaseAdmin
    .from("email_broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId);

  const remaining = unfinished ?? 0;
  const done = (totalRows ?? 0) > 0 && remaining === 0;
  await supabaseAdmin
    .from("email_broadcasts")
    .update({
      sent_count: sentCount ?? 0,
      failed_count: failedCount ?? 0,
      ...(done ? { status: "sent", finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", broadcastId);

  return jsonResponse({
    remaining,
    processed: batch.length,
    sentCount: sentCount ?? 0,
    failedCount: failedCount ?? 0,
    done,
  });
};

const handleBroadcastsList = async () => {
  const { data, error } = await supabaseAdmin
    .from("email_broadcasts")
    .select("id, subject, status, message_type, audience_kind, audience_value, total_recipients, sent_count, failed_count, scheduled_at, created_at, finished_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({
    broadcasts: (data ?? []).map((row) => ({
      id: row.id,
      subject: row.subject,
      status: row.status,
      messageType: row.message_type,
      audienceKind: row.audience_kind,
      audienceValue: row.audience_value,
      totalRecipients: row.total_recipients,
      sentCount: row.sent_count,
      failedCount: row.failed_count,
      scheduledAt: row.scheduled_at,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
    })),
  });
};

const handleKeycloakSync = async () => {
  const result = await syncAllUsersToKeycloak();

  if ("fatalError" in result && result.fatalError) {
    return jsonResponse({ error: result.fatalError }, 500);
  }

  return jsonResponse({
    success: true,
    ...result.summary,
  });
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase env vars" }, 500);
  }

  const { data: rawPayload, error } = await readJson<Record<string, unknown>>(req);
  if (error) {
    return jsonResponse({ error }, 400);
  }

  const parsedPayload = adminRequestSchema.safeParse(rawPayload);
  if (!parsedPayload.success) {
    return jsonResponse({ error: "Invalid admin payload." }, 400);
  }

  const payload = parsedPayload.data;
  const action = payload.action;

  if (action === ADMIN_ACTIONS.BOOTSTRAP_SYNC) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!token || token !== serviceRoleKey) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const reserveResult = await ensureReserveAdminOnce();
    if ("error" in reserveResult) {
      return jsonResponse({ error: reserveResult.error }, 503);
    }

    const migrationResult = await ensureKeycloakMigrationOnce();
    if ("error" in migrationResult) {
      return jsonResponse({ error: migrationResult.error }, 503);
    }

    return jsonResponse({
      success: true,
      ...(migrationResult.summary ?? {}),
    });
  }

  // The broadcast ticker is invoked by the backup-service cron with the
  // service-role key (no user session), like bootstrap.sync. Gate it on the
  // key and run before the super-admin check.
  if (action === ADMIN_ACTIONS.BROADCASTS_TICK) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!token || token !== serviceRoleKey) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    return handleBroadcastsTick();
  }

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status ?? 401);
  }

  // whoami is the only action available to every signed-in user: it answers
  // "am I a super admin?" and, as a side effect, syncs the cache table with
  // the Keycloak role — this is what lets a role granted in Keycloak surface
  // in the app without any manual table edits.
  if (action === ADMIN_ACTIONS.SUPER_ADMINS_WHOAMI) {
    const whoamiIsSuperAdmin = await ensureSuperAdmin(authResult.user.id);
    return jsonResponse({ isSuperAdmin: whoamiIsSuperAdmin });
  }

  const isSuperAdmin = await ensureSuperAdmin(authResult.user.id);
  if (!isSuperAdmin) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  await ensureReserveAdminOnce();
  await ensureKeycloakMigrationOnce();

  switch (action) {
    case ADMIN_ACTIONS.USERS_LIST:
      return handleUsersList(payload as { search?: string });
    case ADMIN_ACTIONS.USERS_CREATE:
      return handleUsersCreate(payload as { email?: string; displayName?: string });
    case ADMIN_ACTIONS.USERS_UPDATE:
      return handleUsersUpdate(payload as { userId?: string; email?: string; displayName?: string; superAdmin?: boolean });
    case ADMIN_ACTIONS.USERS_RESET_PASSWORD:
      return handleUsersResetPassword();
    case ADMIN_ACTIONS.USERS_DELETE:
      return handleUsersDelete(payload as { userId?: string }, authResult.user.id);
    case ADMIN_ACTIONS.WORKSPACES_LIST:
      return handleWorkspacesList();
    case ADMIN_ACTIONS.WORKSPACES_UPDATE:
      return handleWorkspacesUpdate(payload as { workspaceId?: string; name?: string });
    case ADMIN_ACTIONS.WORKSPACES_DELETE:
      return handleWorkspacesDelete(payload as { workspaceId?: string });
    case ADMIN_ACTIONS.SUPER_ADMINS_LIST:
      return handleSuperAdminsList();
    case ADMIN_ACTIONS.SUPER_ADMINS_CREATE:
      return handleSuperAdminsCreate();
    case ADMIN_ACTIONS.SUPER_ADMINS_DELETE:
      return handleSuperAdminsDelete();
    case ADMIN_ACTIONS.KEYCLOAK_SYNC:
      return handleKeycloakSync();
    case ADMIN_ACTIONS.EASTER_EGGS_LIST:
      return handleEasterEggsList();
    case ADMIN_ACTIONS.EASTER_EGGS_SAVE:
      return handleEasterEggsSave(payload as { id?: string; userId: string; eggKey: string; enabled: boolean; note?: string });
    case ADMIN_ACTIONS.EASTER_EGGS_DELETE:
      return handleEasterEggsDelete(payload as { id: string });
    case ADMIN_ACTIONS.BROADCASTS_AUDIENCE:
      return handleBroadcastsAudience(payload as AudienceParams);
    case ADMIN_ACTIONS.BROADCASTS_SEND:
      return handleBroadcastsSend(
        payload as {
          subject: string;
          body: string;
          messageType: BroadcastMessageType;
          audienceKind: BroadcastAudienceKind;
          audienceValue?: string;
          scheduledAt?: string;
        },
        authResult.user.id,
      );
    case ADMIN_ACTIONS.BROADCASTS_PROCESS:
      return handleBroadcastsProcess(payload as { broadcastId: string });
    case ADMIN_ACTIONS.BROADCASTS_LIST:
      return handleBroadcastsList();
    case ADMIN_ACTIONS.BROADCASTS_CANCEL:
      return handleBroadcastsCancel(payload as { broadcastId: string });
    default:
      return jsonResponse({ error: "Unknown action" }, 400);
  }
};

if (import.meta.main) {
  serve(handler);
}
