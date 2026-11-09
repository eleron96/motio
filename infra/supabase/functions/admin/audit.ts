// Admin console → Activity log: writing entries (never in the way of the action
// itself) and reading them with names looked up at read time.
// What is recorded is decided in ../_shared/adminAudit.ts.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import type { AdminAuditEntry } from "../_shared/adminAudit.ts";

const log = (entry: Record<string, unknown>) => {
  console.warn(JSON.stringify({ module: "admin.audit", ...entry }));
};

/** Never throws: an entry that cannot be written is logged and the action stands. */
export const writeAuditEntries = async (
  supabaseAdmin: SupabaseClient,
  actorId: string | null,
  entries: AdminAuditEntry[],
) => {
  if (entries.length === 0) return;
  try {
    const { error } = await supabaseAdmin.from("admin_audit_log").insert(entries.map((entry) => ({
      actor_id: actorId,
      action: entry.action,
      workspace_id: entry.workspaceId,
      target_user_id: entry.targetUserId,
      details: entry.details,
    })));
    if (error) log({ action: "write", result: "error", message: error.message });
  } catch (error) {
    log({ action: "write", result: "error", message: error instanceof Error ? error.message : String(error) });
  }
};

// A workspace's name is gone once it is deleted: remember it beforehand.
export const auditContextBefore = async (
  supabaseAdmin: SupabaseClient,
  action: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  if (action !== "workspaces.delete" || typeof payload.workspaceId !== "string") return {};
  const { data } = await supabaseAdmin
    .from("workspaces")
    .select("name")
    .eq("id", payload.workspaceId)
    .maybeSingle();
  const name = (data as { name?: string } | null)?.name;
  return name ? { name } : {};
};

type AuditRow = {
  id: number;
  created_at: string;
  actor_id: string | null;
  action: string;
  workspace_id: string | null;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
};

const PAGE = 50;

const personName = (profile: { display_name: string | null; email: string | null } | undefined) => (
  profile ? (profile.display_name?.trim() || profile.email || null) : null
);

/** Newest first, `PAGE` at a time; `before` = the id of the last entry already shown. */
export const listAuditEntries = async (supabaseAdmin: SupabaseClient, before?: number) => {
  let query = supabaseAdmin
    .from("admin_audit_log")
    .select("id, created_at, actor_id, action, workspace_id, target_user_id, details")
    .order("id", { ascending: false })
    .limit(PAGE + 1);
  if (before) query = query.lt("id", before);
  const { data, error } = await query;
  if (error) return { error: error.message };

  const rows = (data ?? []) as AuditRow[];
  const page = rows.slice(0, PAGE);
  const people = Array.from(new Set(page.flatMap((row) => [row.actor_id, row.target_user_id]).filter(Boolean))) as string[];
  const workspaces = Array.from(new Set(page.map((row) => row.workspace_id).filter(Boolean))) as string[];

  const [profilesResult, workspacesResult] = await Promise.all([
    people.length > 0
      ? supabaseAdmin.from("profiles").select("id, display_name, email").in("id", people)
      : Promise.resolve({ data: [], error: null }),
    workspaces.length > 0
      ? supabaseAdmin.from("workspaces").select("id, name").in("id", workspaces)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const profileById = new Map(
    ((profilesResult.data ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>)
      .map((profile) => [profile.id, profile]),
  );
  const workspaceById = new Map(
    ((workspacesResult.data ?? []) as Array<{ id: string; name: string }>).map((workspace) => [workspace.id, workspace.name]),
  );

  return {
    entries: page.map((row) => {
      const details = row.details ?? {};
      return {
        id: row.id,
        createdAt: row.created_at,
        action: row.action,
        actorId: row.actor_id,
        actorName: row.actor_id ? personName(profileById.get(row.actor_id)) : null,
        workspaceId: row.workspace_id,
        // A deleted workspace keeps the name it had when it was deleted.
        workspaceName: (row.workspace_id ? workspaceById.get(row.workspace_id) : null)
          ?? (typeof details.name === "string" && row.action === "workspaces.delete" ? details.name : null),
        targetUserId: row.target_user_id,
        targetName: row.target_user_id ? personName(profileById.get(row.target_user_id)) : null,
        details,
      };
    }),
    hasMore: rows.length > PAGE,
  };
};
