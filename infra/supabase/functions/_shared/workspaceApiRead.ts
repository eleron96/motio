// Workspace API, the read-only half: workspace, people, projects, tasks,
// milestones and absences of the workspace the token belongs to. Each handler
// is one call of a database function api_* (migrations 0156, 0187) bound to
// that workspace. Two callers: the HTTP API (functions/api) and the MCP server
// (functions/mcp) — the same rules behind both.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { parseListQuery } from "./timeOffApi.ts";
import {
  parseMilestonesQuery,
  parseProjectsQuery,
  parseTasksQuery,
  toPage,
  type ReadRoute,
} from "./workspaceApi.ts";

/** What a handler answers with; the caller turns it into a response and a log line. */
export type ReadOutcome =
  | { body: unknown; count: number }
  | { status: 404 | 422 | 500; code: string; message: string; errorCode?: string };

const failed = (errorCode: string | undefined): ReadOutcome =>
  ({ status: 500, code: "internal_error", message: "internal error", errorCode });

const invalidQuery = (message: string): ReadOutcome => ({ status: 422, code: "invalid_query", message });

type DatedRow = { id: string; start_date?: string; date?: string };

/** Absences of the workspace that overlap ?from=&to= (both optional). */
export const readTimeOff = async (
  supabaseAdmin: SupabaseClient,
  workspaceId: string,
  params: URLSearchParams,
): Promise<ReadOutcome> => {
  const query = parseListQuery(params);
  if ("error" in query) return invalidQuery(query.error);
  const { data, error } = await supabaseAdmin.rpc("api_list_time_off", {
    p_workspace_id: workspaceId,
    p_from: query.from,
    p_to: query.to,
  });
  if (error) return failed(error.code);
  const items = (data ?? []) as unknown[];
  return { body: { items }, count: items.length };
};

export const handleRead = async (
  supabaseAdmin: SupabaseClient,
  workspaceId: string,
  route: ReadRoute,
  params: URLSearchParams,
): Promise<ReadOutcome> => {
  switch (route.kind) {
    case "workspace": {
      const { data, error } = await supabaseAdmin.rpc("api_get_workspace", { p_workspace_id: workspaceId });
      if (error) return failed(error.code);
      const workspace = ((data ?? []) as unknown as Array<{ id: string; name: string }>)[0];
      if (!workspace) return { status: 404, code: "not_found", message: "the workspace no longer exists" };
      return { body: workspace, count: 1 };
    }
    case "members": {
      const { data, error } = await supabaseAdmin.rpc("api_list_members", { p_workspace_id: workspaceId });
      if (error) return failed(error.code);
      const items = (data ?? []) as unknown[];
      return { body: { items }, count: items.length };
    }
    case "projects": {
      const query = parseProjectsQuery(params);
      if ("error" in query) return invalidQuery(query.error);
      const { data, error } = await supabaseAdmin.rpc("api_list_projects", {
        p_workspace_id: workspaceId,
        p_archived: query.archived,
      });
      if (error) return failed(error.code);
      const items = (data ?? []) as unknown[];
      return { body: { items }, count: items.length };
    }
    case "tasks": {
      const query = parseTasksQuery(params);
      if ("error" in query) return invalidQuery(query.error);
      const { data, error } = await supabaseAdmin.rpc("api_list_tasks", {
        p_workspace_id: workspaceId,
        p_from: query.from,
        p_to: query.to,
        p_project_id: query.projectId,
        p_assignee_id: query.assigneeId,
        p_updated_since: query.updatedSince,
        p_after_date: query.after?.date ?? null,
        p_after_id: query.after?.id ?? null,
        p_limit: query.limit + 1,
      });
      if (error) return failed(error.code);
      const page = toPage((data ?? []) as unknown as DatedRow[], query.limit, (row) => row.start_date ?? "");
      return { body: page, count: page.items.length };
    }
    case "task": {
      const { data, error } = await supabaseAdmin.rpc("api_get_task", {
        p_workspace_id: workspaceId,
        p_task_id: route.taskId,
      });
      if (error) return failed(error.code);
      if (!data) return { status: 404, code: "not_found", message: "no task with this id in the workspace" };
      return { body: data, count: 1 };
    }
    case "milestones": {
      const query = parseMilestonesQuery(params);
      if ("error" in query) return invalidQuery(query.error);
      const { data, error } = await supabaseAdmin.rpc("api_list_milestones", {
        p_workspace_id: workspaceId,
        p_from: query.from,
        p_to: query.to,
        p_project_id: query.projectId,
        p_after_date: query.after?.date ?? null,
        p_after_id: query.after?.id ?? null,
        p_limit: query.limit + 1,
      });
      if (error) return failed(error.code);
      const page = toPage((data ?? []) as unknown as DatedRow[], query.limit, (row) => row.date ?? "");
      return { body: page, count: page.items.length };
    }
  }
};
