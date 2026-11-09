// Admin → Users → a person: how they sign in and why they see what they see —
// the Keycloak account (enabled, address confirmed, pending actions, the
// providers it is linked to), its groups, where super admin comes from, the
// workspaces, and what the group sync would do now (nothing is changed).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  findKeycloakUserById,
  getUserEffectiveRealmRoles,
  getUserRealmRoles,
  keycloakRequest,
  parseKeycloakError,
  type KeycloakConfig,
} from "../_shared/keycloak.ts";
import { getUserGroupPaths } from "../_shared/keycloakGroups.ts";
import { findKeycloakIdentityForUser } from "../_shared/supabaseAuth.ts";
import { SUPER_ADMIN_REALM_ROLE } from "../_shared/superAdminAccess.ts";
import type { InstanceSettingValues } from "../_shared/instanceSettings.ts";
import { previewWorkspacesFromGroups, type GroupWorkspaceDeps } from "./groupWorkspaces.ts";

export type UserDiagnosticsDeps = {
  supabaseAdmin: SupabaseClient;
  keycloakConfig: KeycloakConfig;
  settings: InstanceSettingValues;
  groupDeps: GroupWorkspaceDeps;
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const diagnoseUser = async (deps: UserDiagnosticsDeps, userId: string) => {
  const { supabaseAdmin, keycloakConfig } = deps;
  const authUser = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authUser.error || !authUser.data.user) return { error: "User not found.", status: 404 };
  const user = authUser.data.user;

  const [membersResult, superAdminRow] = await Promise.all([
    supabaseAdmin
      .from("workspace_members")
      .select("workspace_id, role, workspaces(name, owner_id)")
      .eq("user_id", userId),
    supabaseAdmin.from("super_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  const workspaces = ((membersResult.data ?? []) as unknown as Array<{
    workspace_id: string;
    role: string;
    workspaces: { name: string; owner_id: string } | null;
  }>).map((row) => ({
    id: row.workspace_id,
    name: row.workspaces?.name ?? row.workspace_id,
    role: row.workspaces?.owner_id === userId ? "owner" : row.role,
  }));
  const workspaceName = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  const base = {
    user: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    workspaces,
    superAdminInTable: Boolean(superAdminRow.data),
  };

  const identity = await findKeycloakIdentityForUser(supabaseAdmin, userId);
  const keycloakUserId = "error" in identity ? null : identity.identity?.providerId ?? null;
  if (!keycloakUserId) {
    // A password-only account (the reserve admin) or one never linked.
    return { ...base, keycloak: { linked: false as const } };
  }

  const [account, federated, groups, direct, effective] = await Promise.all([
    findKeycloakUserById(keycloakConfig, keycloakUserId),
    keycloakRequest(
      keycloakConfig,
      `/admin/realms/${encodeURIComponent(keycloakConfig.realm)}/users/${encodeURIComponent(keycloakUserId)}/federated-identity`,
      { method: "GET" },
    ).then(async (response) => (response.ok
      ? { links: await response.json() as Array<{ identityProvider?: string; userName?: string }> }
      : { error: await parseKeycloakError(response) })),
    getUserGroupPaths(keycloakConfig, keycloakUserId),
    getUserRealmRoles(keycloakConfig, keycloakUserId),
    getUserEffectiveRealmRoles(keycloakConfig, keycloakUserId),
  ]);

  const roleNames = (result: { roles?: Array<{ name?: string }> } | { error: string }) => (
    "error" in result ? null : (result.roles ?? []).map((role) => role.name ?? "")
  );
  const directRoles = roleNames(direct);
  const effectiveRoles = roleNames(effective);

  let groupSync: Record<string, unknown> = { enabled: deps.settings["groups.workspaces"] };
  if (deps.settings["groups.workspaces"]) {
    try {
      const preview = await previewWorkspacesFromGroups(deps.groupDeps, {
        userId,
        email: user.email ?? "",
        keycloakUserId,
      });
      if (preview) {
        const names = new Map(workspaceName);
        const missing = [
          ...preview.plan.add.map((item) => item.workspaceId),
          ...preview.plan.remove,
        ].filter((id) => !names.has(id));
        if (missing.length > 0) {
          const { data } = await supabaseAdmin.from("workspaces").select("id, name").in("id", missing);
          ((data ?? []) as Array<{ id: string; name: string }>).forEach((row) => names.set(row.id, row.name));
        }
        const named = (id: string) => names.get(id) ?? id;
        groupSync = {
          enabled: true,
          add: preview.plan.add.map((item) => ({ workspaceName: named(item.workspaceId), role: item.role })),
          remove: preview.plan.remove.map((id) => ({ workspaceName: named(id) })),
          changeRole: preview.plan.changeRole.map((item) => ({
            workspaceName: named(item.workspaceId),
            from: item.from,
            role: item.role,
          })),
          manualRoles: preview.plan.manualRoles.map((id) => ({ workspaceName: named(id) })),
        };
      } else {
        groupSync = { enabled: true, add: [], remove: [], changeRole: [], manualRoles: [], noMappings: true };
      }
    } catch (error) {
      groupSync = { enabled: true, error: errorText(error) };
    }
  }

  return {
    ...base,
    keycloak: {
      linked: true as const,
      error: "error" in account ? account.error : null,
      found: "error" in account ? null : Boolean(account.user),
      enabled: "error" in account ? null : account.user?.enabled !== false,
      emailVerified: "error" in account ? null : account.user?.emailVerified === true,
      requiredActions: "error" in account ? [] : account.user?.requiredActions ?? [],
      providers: "error" in federated
        ? []
        : federated.links.map((link) => ({ alias: link.identityProvider ?? "", userName: link.userName ?? null })),
      groups: "error" in groups ? null : groups.paths,
      groupsError: "error" in groups ? groups.error : null,
      superAdmin: {
        direct: directRoles ? directRoles.includes(SUPER_ADMIN_REALM_ROLE) : null,
        viaGroup: directRoles && effectiveRoles
          ? !directRoles.includes(SUPER_ADMIN_REALM_ROLE) && effectiveRoles.includes(SUPER_ADMIN_REALM_ROLE)
          : null,
        fromGroupsAllowed: deps.settings["groups.superAdmin"],
      },
    },
    groupSync,
  };
};
