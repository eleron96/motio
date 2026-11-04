import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export type WorkspaceRole = "viewer" | "editor" | "admin";

export interface AuthUserSummary {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
}

export interface RoleSnapshot {
  isSuperAdmin: boolean;
  workspaceRoles: Set<WorkspaceRole>;
}

const makeRandomPassword = (length = 40) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  for (let index = 0; index < length; index += 1) {
    result += alphabet[bytes[index] % alphabet.length];
  }
  return result;
};

const toLowerEmail = (value: string) => value.trim().toLowerCase();

// Result of a write that has nothing to return. A plain `{}` on success would
// get `error?: undefined` from TypeScript, and `"error" in result` would then
// stop telling the two cases apart.
export type WriteOutcome = { error: string } | { ok: true };

const sanitizeDisplayName = (displayName?: string | null) => {
  const normalized = displayName?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
};

export const createSupabaseClients = (supabaseUrl: string, serviceRoleKey: string) => {
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return { supabaseAdmin };
};

export const listAllAuthUsers = async (
  supabaseAdmin: SupabaseClient,
  options?: { perPage?: number; maxPages?: number },
) => {
  const perPage = options?.perPage && options.perPage > 0
    ? Math.min(options.perPage, 1000)
    : 1000;
  const maxPages = options?.maxPages && options.maxPages > 0
    ? options.maxPages
    : 50;

  const users: AuthUserSummary[] = [];
  let page = 1;

  while (page <= maxPages) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error || !data) {
      return { error: error?.message ?? "Failed to list users." };
    }

    users.push(...data.users.map((user) => ({
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      app_metadata: user.app_metadata,
    })));

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return { users };
};

export const findAuthUserByEmail = async (
  supabaseAdmin: SupabaseClient,
  email: string,
) => {
  const target = toLowerEmail(email);
  if (!target) {
    return { user: null as AuthUserSummary | null };
  }

  const listed = await listAllAuthUsers(supabaseAdmin);
  if ("error" in listed) {
    return { error: listed.error };
  }

  const user = listed.users.find((item) => (item.email ?? "").toLowerCase() === target) ?? null;
  return { user };
};

export const ensureSupabaseUserByEmail = async (
  supabaseAdmin: SupabaseClient,
  email: string,
) => {
  const normalizedEmail = toLowerEmail(email);
  if (!normalizedEmail) {
    return { error: "Email is required." };
  }

  const existing = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);
  if ("error" in existing) {
    return { error: existing.error };
  }

  if (existing.user) {
    return { user: existing.user, created: false };
  }

  const createResult = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: makeRandomPassword(),
    email_confirm: true,
    app_metadata: {
      provider: "keycloak",
      providers: ["keycloak", "email"],
    },
  });

  if (createResult.error || !createResult.data.user) {
    return { error: createResult.error?.message ?? "Failed to create user." };
  }

  return {
    user: {
      id: createResult.data.user.id,
      email: createResult.data.user.email,
      created_at: createResult.data.user.created_at,
      last_sign_in_at: createResult.data.user.last_sign_in_at,
      app_metadata: createResult.data.user.app_metadata,
    },
    created: true,
  };
};

export const ensureProfileDisplayName = async (
  supabaseAdmin: SupabaseClient,
  userId: string,
  displayName?: string | null,
): Promise<WriteOutcome> => {
  const normalized = sanitizeDisplayName(displayName);

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ display_name: normalized })
    .eq("id", userId);

  if (error) {
    return { error: error.message };
  }

  return { ok: true };
};

export const getProfileMap = async (
  supabaseAdmin: SupabaseClient,
  userIds: string[],
) => {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {
      profiles: new Map<string, { displayName: string | null; email: string | null }>(),
    };
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, email")
    .in("id", uniqueIds);

  if (error) {
    return { error: error.message };
  }

  const profiles = new Map<string, { displayName: string | null; email: string | null }>();
  (data ?? []).forEach((row) => {
    profiles.set(row.id, {
      displayName: row.display_name ?? null,
      email: row.email ?? null,
    });
  });

  return { profiles };
};

export const getRoleSnapshotMap = async (
  supabaseAdmin: SupabaseClient,
  userIds?: string[],
) => {
  const uniqueIds = Array.from(new Set((userIds ?? []).filter(Boolean)));

  let superAdminQuery = supabaseAdmin
    .from("super_admins")
    .select("user_id");

  let workspaceQuery = supabaseAdmin
    .from("workspace_members")
    .select("user_id, role");

  if (uniqueIds.length > 0) {
    superAdminQuery = superAdminQuery.in("user_id", uniqueIds);
    workspaceQuery = workspaceQuery.in("user_id", uniqueIds);
  }

  const [{ data: superAdmins, error: superAdminsError }, { data: workspaceMembers, error: workspaceError }] = await Promise.all([
    superAdminQuery,
    workspaceQuery,
  ]);

  if (superAdminsError) {
    return { error: superAdminsError.message };
  }

  if (workspaceError) {
    return { error: workspaceError.message };
  }

  const roleMap = new Map<string, RoleSnapshot>();

  (superAdmins ?? []).forEach((row) => {
    const entry = roleMap.get(row.user_id) ?? { isSuperAdmin: false, workspaceRoles: new Set<WorkspaceRole>() };
    entry.isSuperAdmin = true;
    roleMap.set(row.user_id, entry);
  });

  (workspaceMembers ?? []).forEach((row) => {
    const role = row.role as WorkspaceRole;
    if (!(["viewer", "editor", "admin"] as string[]).includes(role)) {
      return;
    }
    const entry = roleMap.get(row.user_id) ?? { isSuperAdmin: false, workspaceRoles: new Set<WorkspaceRole>() };
    entry.workspaceRoles.add(role);
    roleMap.set(row.user_id, entry);
  });

  return { roleMap };
};

const mergeProviders = (appMetadata: Record<string, unknown> | null | undefined) => {
  const nextMeta: Record<string, unknown> = { ...(appMetadata ?? {}) };
  const providers = new Set<string>();

  const rawProviders = nextMeta.providers;
  if (Array.isArray(rawProviders)) {
    rawProviders.forEach((provider) => {
      if (typeof provider === "string" && provider) {
        providers.add(provider);
      }
    });
  }

  providers.add("keycloak");
  providers.add("email");

  nextMeta.providers = Array.from(providers);
  nextMeta.provider = "keycloak";
  return nextMeta;
};

export const ensureKeycloakIdentityLink = async (
  supabaseAdmin: SupabaseClient,
  payload: {
    supabaseUserId: string;
    email: string;
    displayName?: string | null;
    keycloakUserId: string;
    issuer?: string;
  },
): Promise<WriteOutcome> => {
  const normalizedEmail = toLowerEmail(payload.email);
  if (!normalizedEmail) {
    return { error: "Email is required." };
  }

  const keycloakIdentityData = {
    target_user_id: payload.supabaseUserId,
    keycloak_user_id: payload.keycloakUserId,
    identity_email: normalizedEmail,
    identity_name: payload.displayName?.trim() || null,
    identity_issuer: payload.issuer ?? "keycloak",
  };

  const linkResult = await supabaseAdmin.rpc("link_keycloak_identity", keycloakIdentityData);
  if (linkResult.error) {
    return { error: linkResult.error.message };
  }

  const authUser = await supabaseAdmin.auth.admin.getUserById(payload.supabaseUserId);
  if (authUser.error || !authUser.data.user) {
    return { error: authUser.error?.message ?? "Failed to load auth user." };
  }

  const appMetadata = mergeProviders(authUser.data.user.app_metadata as Record<string, unknown> | null | undefined);

  const updateUser = await supabaseAdmin.auth.admin.updateUserById(payload.supabaseUserId, {
    app_metadata: appMetadata,
    email_confirm: true,
  });

  if (updateUser.error) {
    return { error: updateUser.error.message };
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ email: normalizedEmail })
    .eq("id", payload.supabaseUserId);

  if (profileError) {
    return { error: profileError.message };
  }

  if (payload.displayName !== undefined) {
    const displayNameResult = await ensureProfileDisplayName(supabaseAdmin, payload.supabaseUserId, payload.displayName);
    if ("error" in displayNameResult) {
      return displayNameResult;
    }
  }

  return { ok: true };
};

export const findKeycloakIdentityForUser = async (
  supabaseAdmin: SupabaseClient,
  userId: string,
) => {
  const result = await supabaseAdmin.rpc("get_keycloak_identity", {
    target_user_id: userId,
  });
  if (result.error) {
    return { error: result.error.message };
  }

  return {
    identity: result.data
      ? {
        id: `keycloak-${userId}`,
        providerId: result.data as string,
      }
      : null,
  };
};
