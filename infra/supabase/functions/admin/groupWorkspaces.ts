// Workspaces from Keycloak groups (KEYCLOAK_WORKSPACES_FROM_GROUPS=true,
// self-hosted installs): the sync whoami runs when someone opens Motio, and the
// super admin's mappings. The rules are in ../_shared/groupWorkspaces.ts.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import type { KeycloakConfig } from "../_shared/keycloak.ts";
import { getUserGroupPaths, listRealmGroupPaths } from "../_shared/keycloakGroups.ts";
import {
  normalizeGroupPath,
  planGroupWorkspaceSync,
  type GroupWorkspaceMapping,
  type GroupWorkspaceRole,
} from "../_shared/groupWorkspaces.ts";
import { insertWorkspaceMember } from "./workspaceMembership.ts";
import type { GroupSyncChange } from "../_shared/adminAudit.ts";

export type GroupWorkspaceDeps = {
  supabaseAdmin: SupabaseClient;
  keycloakConfig: KeycloakConfig;
  removeEnabled: boolean;
  // groups.syncRoles: a group change also changes the role it gave.
  syncRoles: boolean;
  // Realm roles mirror memberships for information only (admin/index.ts).
  syncUserRoles: (userId: string, keycloakUserId: string) => Promise<unknown>;
  // Activity log: what the sync changed (admin/audit.ts). Must not throw.
  recordChanges?: (userId: string, changes: GroupSyncChange[]) => Promise<void>;
};

const log = (level: "info" | "warn", entry: Record<string, unknown>) => {
  const line = JSON.stringify({ module: "admin.group-workspaces", ...entry });
  if (level === "warn") console.warn(line); else console.info(line);
};

type PersonRef = { userId: string; email: string; keycloakUserId: string };

// What the sync would do for one person right now: the shared reading part of
// the sync itself and of the admin console's "Check groups now". Throws on a
// failed read; null when there are no mappings and nothing to take back (then
// Keycloak is not even asked).
const planForPerson = async (deps: GroupWorkspaceDeps, person: PersonRef) => {
  const { supabaseAdmin } = deps;
  const [mappingsResult, grantsResult] = await Promise.all([
    supabaseAdmin.from("group_workspace_mappings").select("group_path, workspace_id, role"),
    supabaseAdmin.from("group_workspace_grants").select("workspace_id, role").eq("user_id", person.userId),
  ]);
  if (mappingsResult.error) throw new Error(mappingsResult.error.message);
  if (grantsResult.error) throw new Error(grantsResult.error.message);

  const mappings = (mappingsResult.data ?? []).map((row) => ({
    groupPath: row.group_path as string,
    workspaceId: row.workspace_id as string,
    role: row.role as GroupWorkspaceRole,
  })) satisfies GroupWorkspaceMapping[];
  const grantRows = (grantsResult.data ?? []) as Array<{ workspace_id: string; role: string | null }>;
  const grantedWorkspaceIds = grantRows.map((row) => row.workspace_id);
  const grantedRoles = Object.fromEntries(grantRows.map((row) => [row.workspace_id, row.role]));
  if (mappings.length === 0 && grantedWorkspaceIds.length === 0) return null;

  const membersResult = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, role, workspaces(owner_id)")
    .eq("user_id", person.userId);
  if (membersResult.error) throw new Error(membersResult.error.message);
  const memberRows = (membersResult.data ?? []) as unknown as Array<{
    workspace_id: string;
    role: string;
    workspaces: { owner_id: string } | null;
  }>;

  const groups = await getUserGroupPaths(deps.keycloakConfig, person.keycloakUserId);
  if ("error" in groups) throw new Error(`Keycloak groups: ${groups.error}`);

  const plan = planGroupWorkspaceSync({
    groupPaths: groups.paths,
    mappings,
    memberWorkspaceIds: memberRows.map((row) => row.workspace_id),
    grantedWorkspaceIds,
    ownedWorkspaceIds: memberRows
      .filter((row) => row.workspaces?.owner_id === person.userId)
      .map((row) => row.workspace_id),
    removeEnabled: deps.removeEnabled,
    syncRoles: deps.syncRoles,
    memberRoles: Object.fromEntries(memberRows.map((row) => [row.workspace_id, row.role])),
    grantedRoles,
  });
  return { plan, groupPaths: groups.paths };
};

/** "Check groups now" in the admin console: the plan, nothing changed. Throws on a failed read. */
export const previewWorkspacesFromGroups = async (deps: GroupWorkspaceDeps, person: PersonRef) => (
  planForPerson(deps, person)
);

// Puts the person into the workspaces their groups map to (with removal on,
// takes back what a group gave and no group gives any more; with role sync on,
// moves a group-given role along with the groups unless someone changed it by
// hand). Never throws: a failure here must not keep anyone out of Motio, whoami
// answers anyway.
export const syncWorkspacesFromGroups = async (
  deps: GroupWorkspaceDeps,
  person: PersonRef,
): Promise<{ changed: boolean }> => {
  const { supabaseAdmin } = deps;
  try {
    const planned = await planForPerson(deps, person);
    // Nothing to do and nothing to take back: no question to Keycloak.
    if (!planned) return { changed: false };
    const { plan } = planned;

    const added: string[] = [];
    const limited: string[] = [];
    for (const { workspaceId, role } of plan.add) {
      const inserted = await insertWorkspaceMember(supabaseAdmin, {
        workspaceId,
        userId: person.userId,
        role,
        email: person.email,
      });
      if ("error" in inserted) throw new Error(inserted.error);
      if (inserted.outcome === "limit_reached") {
        limited.push(workspaceId);
        continue;
      }
      if (inserted.outcome === "added") {
        added.push(workspaceId);
        const { error } = await supabaseAdmin
          .from("group_workspace_grants")
          .upsert({ user_id: person.userId, workspace_id: workspaceId, role });
        if (error) throw new Error(error.message);
      }
    }

    const roleChanged: string[] = [];
    for (const { workspaceId, role } of plan.changeRole) {
      const { error } = await supabaseAdmin
        .from("workspace_members")
        .update({ role })
        .eq("workspace_id", workspaceId)
        .eq("user_id", person.userId);
      if (error) throw new Error(error.message);
      const { error: grantError } = await supabaseAdmin
        .from("group_workspace_grants")
        .update({ role })
        .eq("workspace_id", workspaceId)
        .eq("user_id", person.userId);
      if (grantError) throw new Error(grantError.message);
      roleChanged.push(workspaceId);
    }

    for (const { workspaceId, role } of plan.recordGrantRoles) {
      const { error } = await supabaseAdmin
        .from("group_workspace_grants")
        .update({ role })
        .eq("workspace_id", workspaceId)
        .eq("user_id", person.userId)
        .is("role", null);
      if (error) throw new Error(error.message);
    }

    const removed: string[] = [];
    for (const workspaceId of plan.remove) {
      const { error } = await supabaseAdmin
        .from("workspace_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", person.userId);
      if (error) throw new Error(error.message);
      removed.push(workspaceId);
    }

    const forget = [...removed, ...plan.forgetGrants];
    if (forget.length > 0) {
      const { error } = await supabaseAdmin
        .from("group_workspace_grants")
        .delete()
        .eq("user_id", person.userId)
        .in("workspace_id", forget);
      if (error) throw new Error(error.message);
    }

    const changed = added.length > 0 || removed.length > 0 || roleChanged.length > 0;
    if (changed) {
      await deps.syncUserRoles(person.userId, person.keycloakUserId).catch(() => undefined);
      log("info", { action: "sync", entityId: person.userId, result: "success", added, removed, roleChanged });
    }
    if (plan.manualRoles.length > 0) {
      log("info", { action: "sync", entityId: person.userId, result: "manual_override", workspaceIds: plan.manualRoles });
    }
    // Only real changes reach the activity log: what holds the sync back (a
    // hand-set role, the five-workspace limit) would repeat on every visit and
    // stays in the functions log above.
    const changes: GroupSyncChange[] = [
      ...plan.add
        .filter(({ workspaceId }) => added.includes(workspaceId))
        .map(({ workspaceId, role }) => ({ kind: "added" as const, workspaceId, role })),
      ...removed.map((workspaceId) => ({ kind: "removed" as const, workspaceId })),
      ...plan.changeRole.map(({ workspaceId, role, from }) => ({ kind: "roleChanged" as const, workspaceId, from, role })),
    ];
    if (changes.length > 0 && deps.recordChanges) await deps.recordChanges(person.userId, changes);
    if (limited.length > 0) {
      log("warn", { action: "sync", entityId: person.userId, result: "limit_reached", workspaceIds: limited });
    }
    return { changed };
  } catch (error) {
    log("warn", {
      action: "sync",
      entityId: person.userId,
      result: "error",
      message: error instanceof Error ? error.message : String(error),
    });
    return { changed: false };
  }
};

// --- the super admin's mappings ----------------------------------------------

type MappingRow = {
  id: string;
  group_path: string;
  workspace_id: string;
  role: GroupWorkspaceRole;
  created_at: string;
  workspaces: { name: string } | null;
};

export const listGroupWorkspaceMappings = async (deps: GroupWorkspaceDeps) => {
  const { data, error } = await deps.supabaseAdmin
    .from("group_workspace_mappings")
    .select("id, group_path, workspace_id, role, created_at, workspaces(name)")
    .order("group_path")
    .order("created_at");
  if (error) return { error: error.message };

  // The form still works when Keycloak does not answer: the group can be typed.
  const groups = await listRealmGroupPaths(deps.keycloakConfig);
  return {
    mappings: ((data ?? []) as unknown as MappingRow[]).map((row) => ({
      id: row.id,
      groupPath: row.group_path,
      workspaceId: row.workspace_id,
      workspaceName: row.workspaces?.name ?? null,
      role: row.role,
      createdAt: row.created_at,
    })),
    groups: "error" in groups ? [] : groups.paths,
    groupsError: "error" in groups ? groups.error : null,
    removeEnabled: deps.removeEnabled,
    syncRoles: deps.syncRoles,
  };
};

export const createGroupWorkspaceMapping = async (
  deps: GroupWorkspaceDeps,
  input: { groupPath: string; workspaceId: string; role: GroupWorkspaceRole; createdBy: string },
): Promise<{ outcome: "created" | "exists" } | { error: string; status: number }> => {
  const groupPath = normalizeGroupPath(input.groupPath);
  if (!groupPath) return { error: "Group is required.", status: 400 };

  const { data: workspace, error: workspaceError } = await deps.supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("id", input.workspaceId)
    .maybeSingle();
  if (workspaceError) return { error: workspaceError.message, status: 500 };
  if (!workspace) return { error: "Workspace not found.", status: 404 };

  const { error } = await deps.supabaseAdmin
    .from("group_workspace_mappings")
    .insert({ group_path: groupPath, workspace_id: input.workspaceId, role: input.role, created_by: input.createdBy });
  if (error?.code === "23505") return { outcome: "exists" };
  if (error) return { error: error.message, status: 500 };

  log("info", { action: "createMapping", workspaceId: input.workspaceId, groupPath, role: input.role, result: "success" });
  return { outcome: "created" };
};

export const deleteGroupWorkspaceMapping = async (deps: GroupWorkspaceDeps, id: string) => {
  const { error } = await deps.supabaseAdmin.from("group_workspace_mappings").delete().eq("id", id);
  if (error) return { error: error.message };
  log("info", { action: "deleteMapping", entityId: id, result: "success" });
  return { success: true };
};
