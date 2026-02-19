export type AppRealmRole =
  | "app_super_admin"
  | "app_workspace_admin"
  | "app_workspace_editor"
  | "app_workspace_viewer";

export const APP_REALM_ROLES: AppRealmRole[] = [
  "app_super_admin",
  "app_workspace_admin",
  "app_workspace_editor",
  "app_workspace_viewer",
];

export interface KeycloakConfig {
  baseUrl: string;
  realm: string;
  adminRealm: string;
  adminClientId: string;
  adminUsername: string;
  adminPassword: string;
  appClientId: string;
  appRedirectUri: string;
}

interface KeycloakTokenCache {
  cacheKey: string;
  token: string;
  expiresAt: number;
}

interface KeycloakRoleRepresentation {
  id: string;
  name: string;
}

export interface KeycloakUserRepresentation {
  id: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
}

let tokenCache: KeycloakTokenCache | null = null;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const splitDisplayName = (displayName?: string | null) => {
  const raw = displayName?.trim() ?? "";
  if (!raw) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = raw.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" "),
  };
};

const parseKeycloakError = async (response: Response) => {
  const fallback = `Keycloak request failed: ${response.status} ${response.statusText}`;
  const text = await response.text().catch(() => "");
  if (!text) return fallback;

  try {
    const payload = JSON.parse(text) as {
      error?: string;
      error_description?: string;
      errorMessage?: string;
      message?: string;
    };
    return payload.error_description
      ?? payload.errorMessage
      ?? payload.message
      ?? payload.error
      ?? fallback;
  } catch (_error) {
    return text;
  }
};

const getCacheKey = (config: KeycloakConfig) => [
  config.baseUrl,
  config.adminRealm,
  config.adminClientId,
  config.adminUsername,
].join("|");

const fetchAdminToken = async (config: KeycloakConfig, forceRefresh = false) => {
  const cacheKey = getCacheKey(config);
  const now = Date.now();
  if (
    !forceRefresh
    && tokenCache
    && tokenCache.cacheKey === cacheKey
    && tokenCache.expiresAt > now + 30_000
  ) {
    return { token: tokenCache.token };
  }

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: config.adminClientId,
    username: config.adminUsername,
    password: config.adminPassword,
  });

  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}/realms/${encodeURIComponent(config.adminRealm)}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : "Failed to request Keycloak admin token.",
    };
  }

  if (!response.ok) {
    return { error: await parseKeycloakError(response) };
  }

  const payload = await response.json() as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    return { error: "Keycloak admin token response is missing access_token." };
  }

  const expiresInMs = (payload.expires_in ?? 60) * 1000;
  tokenCache = {
    cacheKey,
    token: payload.access_token,
    expiresAt: now + expiresInMs,
  };

  return { token: payload.access_token };
};

const requestWithToken = async (
  config: KeycloakConfig,
  path: string,
  init: RequestInit,
  forceTokenRefresh = false,
): Promise<Response> => {
  const tokenResult = await fetchAdminToken(config, forceTokenRefresh);
  if ("error" in tokenResult) {
    return new Response(tokenResult.error, { status: 503, statusText: "Keycloak unavailable" });
  }

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${tokenResult.token}`);

  try {
    return await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach Keycloak API.";
    return new Response(message, { status: 503, statusText: "Keycloak unavailable" });
  }
};

const keycloakRequest = async (
  config: KeycloakConfig,
  path: string,
  init: RequestInit = {},
) => {
  let response = await requestWithToken(config, path, init, false);
  if (response.status === 401) {
    response = await requestWithToken(config, path, init, true);
  }
  return response;
};

const getRealmRole = async (config: KeycloakConfig, roleName: string) => {
  const response = await keycloakRequest(
    config,
    `/admin/realms/${encodeURIComponent(config.realm)}/roles/${encodeURIComponent(roleName)}`,
    {
      method: "GET",
    },
  );

  if (response.status === 404) {
    return { role: null as KeycloakRoleRepresentation | null };
  }

  if (!response.ok) {
    return { error: await parseKeycloakError(response) };
  }

  const role = await response.json() as KeycloakRoleRepresentation;
  return { role };
};

export const getKeycloakConfig = (): KeycloakConfig => {
  const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:5173").trim() || "http://localhost:5173";
  const appRedirectUri = `${trimTrailingSlash(appUrl)}/auth`;

  return {
    baseUrl: trimTrailingSlash((Deno.env.get("KEYCLOAK_INTERNAL_URL") ?? Deno.env.get("KEYCLOAK_URL") ?? "http://keycloak:8080").trim()),
    realm: (Deno.env.get("KEYCLOAK_REALM") ?? "timeline").trim() || "timeline",
    adminRealm: (Deno.env.get("KEYCLOAK_ADMIN_REALM") ?? "master").trim() || "master",
    adminClientId: (Deno.env.get("KEYCLOAK_ADMIN_CLIENT_ID") ?? "admin-cli").trim() || "admin-cli",
    adminUsername: (Deno.env.get("KEYCLOAK_ADMIN") ?? "").trim(),
    adminPassword: Deno.env.get("KEYCLOAK_ADMIN_PASSWORD") ?? "",
    appClientId: (Deno.env.get("KEYCLOAK_APP_CLIENT_ID") ?? Deno.env.get("GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID") ?? "timeline-supabase").trim() || "timeline-supabase",
    appRedirectUri,
  };
};

export const ensureKeycloakReady = (config: KeycloakConfig) => {
  if (!config.baseUrl) return { error: "KEYCLOAK_INTERNAL_URL (or KEYCLOAK_URL) is not configured." };
  if (!config.realm) return { error: "KEYCLOAK_REALM is not configured." };
  if (!config.adminUsername || !config.adminPassword) {
    return { error: "KEYCLOAK_ADMIN or KEYCLOAK_ADMIN_PASSWORD is not configured." };
  }
  return {};
};

export const ensureRealmRoles = async (
  config: KeycloakConfig,
  roleNames: string[],
) => {
  const roles = new Map<string, KeycloakRoleRepresentation>();

  for (const roleName of roleNames) {
    const existing = await getRealmRole(config, roleName);
    if ("error" in existing) {
      return { error: existing.error };
    }

    if (!existing.role) {
      const createResponse = await keycloakRequest(
        config,
        `/admin/realms/${encodeURIComponent(config.realm)}/roles`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: roleName }),
        },
      );

      if (!(createResponse.status === 201 || createResponse.status === 409)) {
        return { error: await parseKeycloakError(createResponse) };
      }
    }

    const finalRole = await getRealmRole(config, roleName);
    if ("error" in finalRole) {
      return { error: finalRole.error };
    }
    if (!finalRole.role) {
      return { error: `Failed to load Keycloak role ${roleName}.` };
    }
    roles.set(roleName, finalRole.role);
  }

  return { roles };
};

export const findKeycloakUserByEmail = async (config: KeycloakConfig, email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { user: null as KeycloakUserRepresentation | null };
  }

  const response = await keycloakRequest(
    config,
    `/admin/realms/${encodeURIComponent(config.realm)}/users?email=${encodeURIComponent(normalizedEmail)}&exact=true`,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    return { error: await parseKeycloakError(response) };
  }

  const users = await response.json() as KeycloakUserRepresentation[];
  const user = users.find((item) => (item.email ?? "").toLowerCase() === normalizedEmail)
    ?? users[0]
    ?? null;

  return { user };
};

export const findKeycloakUserById = async (config: KeycloakConfig, userId: string) => {
  const response = await keycloakRequest(
    config,
    `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}`,
    { method: "GET" },
  );

  if (response.status === 404) {
    return { user: null as KeycloakUserRepresentation | null };
  }

  if (!response.ok) {
    return { error: await parseKeycloakError(response) };
  }

  const user = await response.json() as KeycloakUserRepresentation;
  return { user };
};

export const ensureKeycloakUser = async (
  config: KeycloakConfig,
  payload: {
    email: string;
    displayName?: string | null;
    enabled?: boolean;
    emailVerified?: boolean;
    requiredActions?: string[];
  },
) => {
  const normalizedEmail = payload.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { error: "Email is required." };
  }

  const desiredEnabled = payload.enabled ?? true;
  const desiredEmailVerified = payload.emailVerified ?? true;
  const { firstName, lastName } = splitDisplayName(payload.displayName);

  const existing = await findKeycloakUserByEmail(config, normalizedEmail);
  if ("error" in existing) {
    return { error: existing.error };
  }

  if (existing.user) {
    const shouldUpdate = (
      (existing.user.username ?? "") !== normalizedEmail
      || (existing.user.email ?? "") !== normalizedEmail
      || (existing.user.enabled ?? true) !== desiredEnabled
      || (existing.user.emailVerified ?? false) !== desiredEmailVerified
      || (existing.user.firstName ?? "") !== firstName
      || (existing.user.lastName ?? "") !== lastName
    );

    if (shouldUpdate) {
      const updateResponse = await keycloakRequest(
        config,
        `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(existing.user.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: normalizedEmail,
            email: normalizedEmail,
            enabled: desiredEnabled,
            emailVerified: desiredEmailVerified,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
          }),
        },
      );

      if (!updateResponse.ok) {
        return { error: await parseKeycloakError(updateResponse) };
      }
    }

    const refreshed = await findKeycloakUserById(config, existing.user.id);
    if ("error" in refreshed) {
      return { error: refreshed.error };
    }

    return {
      user: refreshed.user ?? existing.user,
      created: false,
    };
  }

  const createResponse = await keycloakRequest(
    config,
    `/admin/realms/${encodeURIComponent(config.realm)}/users`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: normalizedEmail,
        email: normalizedEmail,
        enabled: desiredEnabled,
        emailVerified: desiredEmailVerified,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        requiredActions: payload.requiredActions,
      }),
    },
  );

  if (!(createResponse.status === 201 || createResponse.status === 409)) {
    return { error: await parseKeycloakError(createResponse) };
  }

  const created = await findKeycloakUserByEmail(config, normalizedEmail);
  if ("error" in created) {
    return { error: created.error };
  }

  if (!created.user) {
    return { error: "Failed to resolve created Keycloak user." };
  }

  return {
    user: created.user,
    created: true,
  };
};

export const setKeycloakUserPassword = async (
  config: KeycloakConfig,
  userId: string,
  password: string,
  temporary = false,
) => {
  if (!password) {
    return { error: "Password is required." };
  }

  const response = await keycloakRequest(
    config,
    `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "password",
        value: password,
        temporary,
      }),
    },
  );

  if (!response.ok) {
    return { error: await parseKeycloakError(response) };
  }

  return {};
};

export const sendKeycloakExecuteActionsEmail = async (
  config: KeycloakConfig,
  userId: string,
  actions: string[] = ["UPDATE_PASSWORD"],
  options?: {
    clientId?: string;
    redirectUri?: string;
    lifespanSeconds?: number;
  },
) => {
  const query = new URLSearchParams({
    client_id: options?.clientId ?? config.appClientId,
    redirect_uri: options?.redirectUri ?? config.appRedirectUri,
  });
  if (typeof options?.lifespanSeconds === "number" && Number.isFinite(options.lifespanSeconds) && options.lifespanSeconds > 0) {
    query.set("lifespan", String(Math.floor(options.lifespanSeconds)));
  }

  const response = await keycloakRequest(
    config,
    `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/execute-actions-email?${query.toString()}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actions),
    },
  );

  if (!response.ok) {
    return { error: await parseKeycloakError(response) };
  }

  return {};
};

export const getUserRealmRoles = async (config: KeycloakConfig, userId: string) => {
  const response = await keycloakRequest(
    config,
    `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
    { method: "GET" },
  );

  if (!response.ok) {
    return { error: await parseKeycloakError(response) };
  }

  const roles = await response.json() as KeycloakRoleRepresentation[];
  return { roles };
};

export const syncUserRealmRoles = async (
  config: KeycloakConfig,
  userId: string,
  desiredRoleNames: string[],
  managedRoleNames: string[],
) => {
  const uniqueManaged = Array.from(new Set(managedRoleNames));
  const uniqueDesired = Array.from(new Set(desiredRoleNames)).filter((roleName) => uniqueManaged.includes(roleName));

  const ensuredRolesResult = await ensureRealmRoles(config, uniqueManaged);
  if ("error" in ensuredRolesResult) {
    return { error: ensuredRolesResult.error };
  }

  const currentRolesResult = await getUserRealmRoles(config, userId);
  if ("error" in currentRolesResult) {
    return { error: currentRolesResult.error };
  }

  const currentManagedRoleNames = new Set(
    (currentRolesResult.roles ?? [])
      .map((role) => role.name)
      .filter((name): name is string => Boolean(name && uniqueManaged.includes(name))),
  );

  const desiredSet = new Set(uniqueDesired);

  const toAdd = uniqueDesired.filter((roleName) => !currentManagedRoleNames.has(roleName));
  const toRemove = Array.from(currentManagedRoleNames).filter((roleName) => !desiredSet.has(roleName));

  if (toAdd.length > 0) {
    const payload = toAdd
      .map((roleName) => ensuredRolesResult.roles.get(roleName))
      .filter((role): role is KeycloakRoleRepresentation => Boolean(role));

    if (payload.length > 0) {
      const addResponse = await keycloakRequest(
        config,
        `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!addResponse.ok) {
        return { error: await parseKeycloakError(addResponse) };
      }
    }
  }

  if (toRemove.length > 0) {
    const payload = toRemove
      .map((roleName) => ensuredRolesResult.roles.get(roleName))
      .filter((role): role is KeycloakRoleRepresentation => Boolean(role));

    if (payload.length > 0) {
      const removeResponse = await keycloakRequest(
        config,
        `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!removeResponse.ok) {
        return { error: await parseKeycloakError(removeResponse) };
      }
    }
  }

  return {
    added: toAdd,
    removed: toRemove,
  };
};

export const deleteKeycloakUser = async (config: KeycloakConfig, userId: string) => {
  const response = await keycloakRequest(
    config,
    `/admin/realms/${encodeURIComponent(config.realm)}/users/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );

  if (response.status === 404 || response.status === 204) {
    return {};
  }

  if (!response.ok) {
    return { error: await parseKeycloakError(response) };
  }

  return {};
};
