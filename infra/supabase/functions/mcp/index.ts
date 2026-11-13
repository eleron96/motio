import { createSupabaseClients } from "../_shared/supabaseAuth.ts";
import { captureException } from "../_shared/sentryCapture.ts";
import { planMcpMessage, toolProtocolError, toolReply, type McpReply } from "../_shared/mcpProtocol.ts";
import { planToolCall } from "../_shared/mcpTools.ts";
import { MAX_BODY_BYTES, parseBearerToken, sha256Hex } from "../_shared/timeOffApi.ts";
import { handleRead, readTimeOff } from "../_shared/workspaceApiRead.ts";

/**
 * Motio MCP server: lets an AI assistant read one workspace — people,
 * projects, tasks, milestones and time off — through the Model Context
 * Protocol (Streamable HTTP, stateless).
 *
 *   POST /functions/v1/mcp     one JSON-RPC request or notification per call
 *
 * Auth: "Authorization: Bearer motio_…" — a workspace token with the "read"
 * scope, the same one the workspace API takes. Every tool reads through the
 * api_* database functions the API uses, bound to the token's workspace;
 * nothing here can change data. No CORS and no browser origins. Rate limited
 * per IP in the gateway (zone mcp_limit). Reference: docs/mcp.md.
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const send = (reply: McpReply, extraHeaders: Record<string, string> = {}) =>
  new Response(reply.body === null ? null : JSON.stringify(reply.body), {
    status: reply.status,
    headers: {
      ...(reply.body === null ? {} : { "Content-Type": "application/json" }),
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

// Outside the protocol (auth, size, method): JSON-RPC shaped, without an id.
const refuse = (status: number, message: string, extraHeaders: Record<string, string> = {}) =>
  send({ status, body: { jsonrpc: "2.0", error: { code: -32600, message } } }, extraHeaders);

// Structured log line (AGENTS.md §6): no tokens, no emails, no tool arguments.
const log = (
  level: "info" | "error",
  fields: {
    action: string;
    workspaceId?: string;
    // The display prefix of the token ("motio_1a2b3c4d"), as the settings show it: never the token.
    token?: string;
    result: "success" | "error";
    errorCode?: string;
    count?: number;
  },
) => {
  const line = JSON.stringify({ module: "api.mcp", ...fields });
  if (level === "error") console.error(line);
  else console.info(line);
};

export const handler = async (req: Request): Promise<Response> => {
  // The protocol is POST only: no GET stream, no sessions to DELETE.
  if (req.method !== "POST") {
    return refuse(405, "The MCP endpoint accepts POST only", { Allow: "POST" });
  }
  // A browser page has no business here (and this blunts DNS rebinding): MCP
  // clients that run on a server or a desktop send no Origin.
  if (req.headers.get("origin")) {
    return refuse(403, "Requests from a browser origin are not accepted");
  }

  const token = parseBearerToken(req.headers.get("authorization"));
  if (!token) {
    return refuse(401, "A workspace token is required: Authorization: Bearer motio_…", {
      "WWW-Authenticate": 'Bearer realm="motio"',
    });
  }
  const { data: accessRows, error: tokenError } = await supabaseAdmin.rpc("api_token_access", {
    p_token_hash: await sha256Hex(token),
  });
  if (tokenError) {
    captureException(new Error(`mcp token lookup failed: ${tokenError.message}`), { tags: { function: "mcp" } });
    log("error", { action: "authenticate", result: "error", errorCode: tokenError.code });
    return refuse(500, "Internal error");
  }
  const access = ((accessRows ?? []) as unknown as Array<{ workspace_id: string; scopes: string[]; token_prefix?: string }>)[0];
  if (!access) {
    return refuse(401, "Unknown or revoked workspace token", {
      "WWW-Authenticate": 'Bearer realm="motio", error="invalid_token"',
    });
  }
  const workspaceId = access.workspace_id;
  const tokenPrefix = access.token_prefix;
  if (!access.scopes.includes("read")) {
    log("info", { action: "authenticate", workspaceId, token: tokenPrefix, result: "error", errorCode: "forbidden" });
    return refuse(403, "This token lacks the scope: read");
  }

  const text = await req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return refuse(413, `The body must be at most ${MAX_BODY_BYTES} bytes`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return send({ status: 400, body: { jsonrpc: "2.0", error: { code: -32700, message: "The body must be JSON" } } });
  }

  const plan = planMcpMessage(body, {
    protocolVersion: req.headers.get("mcp-protocol-version"),
    method: req.headers.get("mcp-method"),
    name: req.headers.get("mcp-name"),
  });
  if (plan.kind === "reply") {
    return send(plan.reply);
  }

  const call = planToolCall(plan.name, plan.args);
  if ("unknownTool" in call) {
    return send(toolProtocolError(plan.era, plan.id, `Unknown tool: ${String(plan.name).slice(0, 80)}`));
  }
  const action = String(plan.name);
  if ("invalid" in call) {
    log("info", { action, workspaceId, token: tokenPrefix, result: "error", errorCode: "invalid_arguments" });
    return send(toolReply(plan.era, plan.id, { error: call.invalid }));
  }

  const outcome = call.target.kind === "time-off"
    ? await readTimeOff(supabaseAdmin, workspaceId, call.params)
    : await handleRead(supabaseAdmin, workspaceId, call.target, call.params);
  if ("status" in outcome) {
    log(outcome.status === 500 ? "error" : "info", {
      action,
      workspaceId,
      token: tokenPrefix,
      result: "error",
      errorCode: outcome.errorCode ?? outcome.code,
    });
    return send(toolReply(plan.era, plan.id, { error: outcome.message }));
  }
  log("info", { action, workspaceId, token: tokenPrefix, result: "success", count: outcome.count });
  return send(toolReply(plan.era, plan.id, { data: outcome.body }));
};

if (import.meta.main) {
  Deno.serve(handler);
}
