// Admin console → Workspaces → Members: a super admin sees who is in a
// workspace, changes a role or takes someone out, without being a member.
// Writes go to workspace_members like the workspace's own "Members and access"
// does, so the same triggers run (timeline rows, assignees), and each change
// lands in the workspace's member history with the super admin as the actor.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export type AdminMemberRole = "viewer" | "editor" | "admin";

export type WorkspaceMembersDeps = {
  supabaseAdmin: SupabaseClient;
  // Realm roles mirror memberships for information only (admin/index.ts).
  syncRolesOf: (userId: string) => Promise<void>;
};

type Failure = { error: string; status: number };

type MemberRow = {
  user_id: string;
  role: string;
  created_at: string | null;
  profiles: { email: string | null; display_name: string | null } | null;
};

const log = (entry: Record<string, unknown>) => {
  console.info(JSON.stringify({ module: "admin.workspace-members", ...entry }));
};

const loadWorkspace = async (
  supabaseAdmin: SupabaseClient,
  workspaceId: string,
): Promise<{ workspace: { id: string; owner_id: string } } | Failure> => {
  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("id, owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: "Workspace not found.", status: 404 };
  return { workspace: data as { id: string; owner_id: string } };
};

const loadMember = async (
  supabaseAdmin: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<{ member: MemberRow } | Failure> => {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("user_id, role, created_at, profiles(email, display_name)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: "This person is not in the workspace.", status: 404 };
  return { member: data as unknown as MemberRow };
};

const personLabel = (profile: MemberRow["profiles"], fallback: string) => (
  profile?.display_name?.trim() || profile?.email || fallback
);

// The member history shows who did it; for a super admin that is their name.
const recordActivity = async (
  supabaseAdmin: SupabaseClient,
  input: {
    workspaceId: string;
    actorId: string;
    action: "member_role_changed" | "member_removed";
    member: MemberRow;
    details: Record<string, unknown>;
  },
) => {
  const { data: actor } = await supabaseAdmin
    .from("profiles")
    .select("email, display_name")
    .eq("id", input.actorId)
    .maybeSingle();
  const actorProfile = actor as { email: string | null; display_name: string | null } | null;
  const { error } = await supabaseAdmin.from("workspace_member_activity").insert({
    workspace_id: input.workspaceId,
    action: input.action,
    actor_user_id: input.actorId,
    actor_label: actorProfile?.display_name?.trim() || actorProfile?.email || "Super admin",
    target_user_id: input.member.user_id,
    target_label: personLabel(input.member.profiles, input.member.user_id),
    target_email: input.member.profiles?.email ?? null,
    details: { ...input.details, via: "admin_console" },
  });
  // The change itself is done; a missing history line must not undo it.
  if (error) {
    console.warn(JSON.stringify({
      module: "admin.workspace-members",
      action: input.action,
      workspaceId: input.workspaceId,
      result: "activity_failed",
      message: error.message,
    }));
  }
};

export type AdminWorkspaceMember = {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: string;
  isOwner: boolean;
  viaGroup: boolean;
  joinedAt: string | null;
};

export const listWorkspaceMembers = async (
  deps: WorkspaceMembersDeps,
  workspaceId: string,
): Promise<{ members: AdminWorkspaceMember[] } | Failure> => {
  const loaded = await loadWorkspace(deps.supabaseAdmin, workspaceId);
  if ("error" in loaded) return loaded;

  const [membersResult, grantsResult] = await Promise.all([
    deps.supabaseAdmin
      .from("workspace_members")
      .select("user_id, role, created_at, profiles(email, display_name)")
      .eq("workspace_id", workspaceId),
    deps.supabaseAdmin
      .from("group_workspace_grants")
      .select("user_id")
      .eq("workspace_id", workspaceId),
  ]);
  if (membersResult.error) return { error: membersResult.error.message, status: 500 };
  // Without the grants (older database) everyone simply shows as added by hand.
  const viaGroup = new Set(((grantsResult.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id));

  const ownerId = loaded.workspace.owner_id;
  const members = ((membersResult.data ?? []) as unknown as MemberRow[])
    .map((row) => ({
      userId: row.user_id,
      email: row.profiles?.email ?? null,
      displayName: row.profiles?.display_name ?? null,
      role: row.role,
      isOwner: row.user_id === ownerId,
      viaGroup: viaGroup.has(row.user_id),
      joinedAt: row.created_at,
    }))
    .sort((a, b) => {
      if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
      const left = (a.displayName || a.email || a.userId).toLowerCase();
      const right = (b.displayName || b.email || b.userId).toLowerCase();
      return left.localeCompare(right);
    });
  return { members };
};

export const setWorkspaceMemberRole = async (
  deps: WorkspaceMembersDeps,
  input: { workspaceId: string; userId: string; role: AdminMemberRole; actorId: string },
): Promise<{ outcome: "changed" | "unchanged" } | Failure> => {
  const loaded = await loadWorkspace(deps.supabaseAdmin, input.workspaceId);
  if ("error" in loaded) return loaded;
  if (loaded.workspace.owner_id === input.userId) {
    return { error: "The owner of a workspace is always its admin.", status: 409 };
  }
  const found = await loadMember(deps.supabaseAdmin, input.workspaceId, input.userId);
  if ("error" in found) return found;
  if (found.member.role === input.role) return { outcome: "unchanged" };

  const { error } = await deps.supabaseAdmin
    .from("workspace_members")
    .update({ role: input.role })
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId);
  if (error) return { error: error.message, status: 500 };

  await recordActivity(deps.supabaseAdmin, {
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "member_role_changed",
    member: found.member,
    details: { previousRole: found.member.role, nextRole: input.role },
  });
  await deps.syncRolesOf(input.userId);
  log({ action: "setRole", workspaceId: input.workspaceId, entityId: input.userId, role: input.role, result: "success" });
  return { outcome: "changed" };
};

export const removeWorkspaceMember = async (
  deps: WorkspaceMembersDeps,
  input: { workspaceId: string; userId: string; actorId: string },
): Promise<{ outcome: "removed" } | Failure> => {
  const loaded = await loadWorkspace(deps.supabaseAdmin, input.workspaceId);
  if ("error" in loaded) return loaded;
  if (loaded.workspace.owner_id === input.userId) {
    return { error: "The owner cannot leave their workspace; delete the workspace instead.", status: 409 };
  }
  const found = await loadMember(deps.supabaseAdmin, input.workspaceId, input.userId);
  if ("error" in found) return found;

  const { error } = await deps.supabaseAdmin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId);
  if (error) return { error: error.message, status: 500 };

  await recordActivity(deps.supabaseAdmin, {
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: "member_removed",
    member: found.member,
    details: { previousRole: found.member.role },
  });
  await deps.syncRolesOf(input.userId);
  log({ action: "remove", workspaceId: input.workspaceId, entityId: input.userId, result: "success" });
  return { outcome: "removed" };
};
