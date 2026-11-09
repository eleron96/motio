// Admin → Invitations: every invitation nobody has answered yet, across
// workspaces — to copy its link (installs without email) or to revoke it.
// Revoking is what the inviting workspace admin's "Cancel" does.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

type InviteRow = {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  token: string;
  created_at: string;
  expires_at: string;
  invited_by: string | null;
  workspaces: { name: string } | null;
};

const LIMIT = 500;

export const listOpenInvitations = async (supabaseAdmin: SupabaseClient) => {
  const { data, error } = await supabaseAdmin
    .from("workspace_invites")
    .select("id, workspace_id, email, role, token, created_at, expires_at, invited_by, workspaces(name)")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) return { error: error.message };
  const rows = (data ?? []) as unknown as InviteRow[];
  const inviterIds = Array.from(new Set(rows.map((row) => row.invited_by).filter(Boolean))) as string[];
  const { data: inviters } = inviterIds.length > 0
    ? await supabaseAdmin.from("profiles").select("id, display_name, email").in("id", inviterIds)
    : { data: [] };
  const inviterName = new Map(
    ((inviters ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>)
      .map((profile) => [profile.id, profile.display_name?.trim() || profile.email || null]),
  );
  const now = Date.now();
  return {
    invitations: rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      workspaceName: row.workspaces?.name ?? null,
      email: row.email,
      role: row.role,
      token: row.token,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      expired: new Date(row.expires_at).getTime() <= now,
      invitedByName: row.invited_by ? inviterName.get(row.invited_by) ?? null : null,
    })),
    truncated: rows.length >= LIMIT,
  };
};

export const revokeInvitation = async (supabaseAdmin: SupabaseClient, inviteId: string) => {
  const { data, error } = await supabaseAdmin
    .from("workspace_invites")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: "canceled" })
    .eq("id", inviteId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id");
  if (error) return { error: error.message, status: 500 };
  if (!data || data.length === 0) return { error: "This invitation is already answered or revoked.", status: 409 };
  console.info(JSON.stringify({ module: "admin.invitations", action: "revoke", entityId: inviteId, result: "success" }));
  return { outcome: "revoked" as const };
};
