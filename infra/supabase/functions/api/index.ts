import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createSupabaseClients } from "../_shared/supabaseAuth.ts";
import { captureException } from "../_shared/sentryCapture.ts";
import {
  MAX_BODY_BYTES,
  parseApiRoute,
  parseBearerToken,
  parseListQuery,
  parseUpsertBody,
  sha256Hex,
} from "../_shared/timeOffApi.ts";

/**
 * Workspace API: import absences from an external system.
 *
 *   GET    /functions/v1/api/v1/time-off?from=&to=   list time off of the workspace
 *   PUT    /functions/v1/api/v1/time-off             create/update by external_id
 *   DELETE /functions/v1/api/v1/time-off/{id}        delete an imported record
 *
 * Auth: "Authorization: Bearer motio_…" — a workspace token created by a
 * workspace admin in the settings. Server-to-server only: no CORS headers, no
 * browser session. Rate limited per IP in the gateway (zone public_api_limit).
 * Reference: docs/api.md.
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const errorResponse = (status: number, code: string, message: string) =>
  jsonResponse({ error: { code, message } }, status);

// Structured log line (AGENTS.md §6): no tokens, no emails.
const log = (
  level: "info" | "error",
  fields: { action: string; workspaceId?: string; result: "success" | "error"; errorCode?: string; count?: number },
) => {
  const line = JSON.stringify({ module: "api.time-off", ...fields });
  if (level === "error") console.error(line);
  else console.info(line);
};

const readJsonBody = async (req: Request): Promise<{ body: unknown } | { error: Response }> => {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return { error: errorResponse(413, "payload_too_large", `body must be at most ${MAX_BODY_BYTES} bytes`) };
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { error: errorResponse(413, "payload_too_large", `body must be at most ${MAX_BODY_BYTES} bytes`) };
  }
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: errorResponse(400, "invalid_json", "body must be JSON") };
  }
};

export const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const route = parseApiRoute(req.method, url.pathname);
  if ("error" in route) {
    return route.error === "not_found"
      ? errorResponse(404, "not_found", "unknown endpoint")
      : errorResponse(405, "method_not_allowed", "method not allowed for this endpoint");
  }

  const token = parseBearerToken(req.headers.get("authorization"));
  if (!token) {
    return errorResponse(401, "unauthorized", "missing or malformed workspace token");
  }

  const { data: workspaceId, error: tokenError } = await supabaseAdmin.rpc("api_token_workspace", {
    p_token_hash: await sha256Hex(token),
  });
  if (tokenError) {
    captureException(new Error(`api token lookup failed: ${tokenError.message}`), { tags: { function: "api" } });
    log("error", { action: "authenticate", result: "error", errorCode: tokenError.code });
    return errorResponse(500, "internal_error", "internal error");
  }
  if (!workspaceId) {
    return errorResponse(401, "unauthorized", "unknown or revoked workspace token");
  }

  if (route.kind === "list") {
    const query = parseListQuery(url.searchParams);
    if ("error" in query) return errorResponse(422, "invalid_query", query.error);
    const { data, error } = await supabaseAdmin.rpc("api_list_time_off", {
      p_workspace_id: workspaceId,
      p_from: query.from,
      p_to: query.to,
    });
    if (error) {
      log("error", { action: "list", workspaceId, result: "error", errorCode: error.code });
      return errorResponse(500, "internal_error", "internal error");
    }
    log("info", { action: "list", workspaceId, result: "success", count: data?.length ?? 0 });
    return jsonResponse({ items: data ?? [] });
  }

  if (route.kind === "upsert") {
    const parsed = await readJsonBody(req);
    if ("error" in parsed) return parsed.error;
    const body = parseUpsertBody(parsed.body);
    if ("error" in body) return errorResponse(422, "invalid_body", body.error);
    const { data, error } = await supabaseAdmin.rpc("api_upsert_time_off", {
      p_workspace_id: workspaceId,
      p_items: body.items,
    });
    if (error) {
      log("error", { action: "upsert", workspaceId, result: "error", errorCode: error.code });
      return errorResponse(500, "internal_error", "internal error");
    }
    const results = (data ?? []) as Array<{ status: string }>;
    const summary = { created: 0, updated: 0, unchanged: 0, error: 0 } as Record<string, number>;
    for (const result of results) summary[result.status] = (summary[result.status] ?? 0) + 1;
    log("info", { action: "upsert", workspaceId, result: "success", count: results.length });
    return jsonResponse({ summary, results });
  }

  const { data: deleted, error } = await supabaseAdmin.rpc("api_delete_time_off", {
    p_workspace_id: workspaceId,
    p_external_id: route.externalId,
  });
  if (error) {
    log("error", { action: "delete", workspaceId, result: "error", errorCode: error.code });
    return errorResponse(500, "internal_error", "internal error");
  }
  if (!deleted) {
    return errorResponse(404, "not_found", "no imported time off with this external_id");
  }
  log("info", { action: "delete", workspaceId, result: "success" });
  return new Response(null, { status: 204 });
};

if (import.meta.main) {
  serve(handler);
}
