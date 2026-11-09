// Admin → System → Support report: counts and switches of this install, for a
// bug report. Nothing personal and no secrets: no emails, names, addresses,
// keys or hostnames — the app adds its version and build flags, and the super
// admin downloads the result as a file to read before sending.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const countOf = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count, error } = await query;
  return error ? null : count ?? 0;
};

export const readReportCounts = async (supabaseAdmin: SupabaseClient) => {
  const nowIso = new Date().toISOString();
  const all = (table: string) => supabaseAdmin.from(table).select("*", { count: "exact", head: true });
  const [people, workspaces, memberships, tasks, openInvitations, groupMappings, closures] = await Promise.all([
    countOf(all("profiles")),
    countOf(all("workspaces")),
    countOf(all("workspace_members")),
    countOf(all("tasks")),
    countOf(all("workspace_invites").is("accepted_at", null).is("revoked_at", null).gt("expires_at", nowIso)),
    countOf(all("group_workspace_mappings")),
    countOf(all("workspace_closures")),
  ]);
  return { people, workspaces, memberships, tasks, openInvitations, groupMappings, closures };
};
