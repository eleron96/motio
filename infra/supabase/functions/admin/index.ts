import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { z } from "npm:zod@3.25.76";
import { ADMIN_ACTIONS } from "../_shared/actions.ts";
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
    action: z.literal(ADMIN_ACTIONS.SUPER_ADMINS_DELETE),
    userId: z.string().min(1),
  }).strict(),
  z.object({
    action: z.literal(ADMIN_ACTIONS.KEYCLOAK_SYNC),
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

const ensureSuperAdmin = async (userId: string) => {
  const { data: superAdminRow, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  const inTable = Boolean(superAdminRow && !error);

  const keycloakReady = ensureKeycloakReady(keycloakConfig);
  if ("error" in keycloakReady) {
    return inTable;
  }

  const identityResult = await findKeycloakIdentityForUser(supabaseAdmin, userId);
  if ("error" in identityResult || !identityResult.identity?.providerId) {
    return inTable;
  }

  const keycloakRoles = await getUserRealmRoles(keycloakConfig, identityResult.identity.providerId);
  if ("error" in keycloakRoles) {
    return inTable;
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
    return jsonResponse({ error: listed.error }, 400);
  }

  const { userIds: superAdminIds } = await listSuperAdminIds();
  const superAdminSet = new Set(superAdminIds);

  if (reserveAdminEmail) {
    const reserveUser = await findAuthUserByEmail(supabaseAdmin, reserveAdminEmail);
    if ("error" in reserveUser) {
      return jsonResponse({ error: reserveUser.error }, 400);
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
    { data: profiles },
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

  if (membershipsError) {
    return jsonResponse({ error: membershipsError.message }, 400);
  }
  if (ownedWorkspacesError) {
    return jsonResponse({ error: ownedWorkspacesError.message }, 400);
  }
  if (taskMediaError) {
    return jsonResponse({ error: taskMediaError.message }, 400);
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
    return jsonResponse({ error: error.message }, 400);
  }

  const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id);
  const ownerIds = Array.from(new Set((workspaces ?? []).map((workspace) => workspace.owner_id)));

  if (workspaceIds.length === 0) {
    return jsonResponse({ workspaces: [] });
  }

  const [{ data: members }, { data: tasks }, { data: owners }] = await Promise.all([
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
    return jsonResponse({ error: error.message }, 400);
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
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ success: true });
};

const handleSuperAdminsList = async () => {
  const { data, error } = await supabaseAdmin
    .from("super_admins")
    .select("user_id, created_at");
  if (error) {
    return jsonResponse({ error: error.message }, 400);
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

const handleKeycloakSync = async () => {
  const result = await syncAllUsersToKeycloak();

  if ("fatalError" in result && result.fatalError) {
    return jsonResponse({ error: result.fatalError }, 400);
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

  await ensureReserveAdminOnce();
  await ensureKeycloakMigrationOnce();

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status ?? 401);
  }

  const isSuperAdmin = await ensureSuperAdmin(authResult.user.id);
  if (!isSuperAdmin) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

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
    default:
      return jsonResponse({ error: "Unknown action" }, 400);
  }
};

if (import.meta.main) {
  serve(handler);
}
