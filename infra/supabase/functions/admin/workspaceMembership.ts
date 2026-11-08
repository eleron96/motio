// Putting an existing account into a workspace on the server side, without an
// invitation: the super admin's "Add member" and workspaces from groups.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export type MemberInsertOutcome = "added" | "already_member" | "limit_reached";

export const insertWorkspaceMember = async (
  supabaseAdmin: SupabaseClient,
  input: { workspaceId: string; userId: string; role: string; email: string },
): Promise<{ outcome: MemberInsertOutcome } | { error: string }> => {
  const { error } = await supabaseAdmin
    .from("workspace_members")
    .insert({ workspace_id: input.workspaceId, user_id: input.userId, role: input.role });
  if (error) {
    // enforce_workspace_limit (0001): one account belongs to at most 5 workspaces.
    if (error.message.includes("workspace limit reached")) return { outcome: "limit_reached" };
    if (error.code === "23505") return { outcome: "already_member" };
    return { error: error.message };
  }

  // An invitation still waiting for this person would ask them again.
  const email = input.email.trim().toLowerCase();
  if (email) {
    await supabaseAdmin
      .from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("workspace_id", input.workspaceId)
      .eq("email_normalized", email)
      .is("accepted_at", null)
      .is("revoked_at", null);
  }
  return { outcome: "added" };
};
