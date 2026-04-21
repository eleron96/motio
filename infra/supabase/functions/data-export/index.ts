// Edge Function `data-export` — генерация и выдача персонального JSON-экспорта.
//
// Два action-а:
//   * `generate` (service_role, из cron) — обрабатывает одну pending-заявку.
//     Последовательность:
//       1. `_pick_export_request` (перевод в processing с блокировкой).
//       2. Сбор JSON (profile + workspaces + tasks + comments + activity).
//       3. Upload в bucket `user-exports/{user_id}/{request_id}.json`.
//       4. `_finalize_export_request(status='ready', file_path)` — или `failed` с error_message.
//
//   * `status` (user JWT) — возвращает последний запрос юзера;
//     для статуса `ready` добавляет signedUrl с TTL на скачивание.
//
// Контракт:
//   POST /functions/v1/data-export  { "action": "generate" | "status" }
//   auth:
//     - generate: Authorization: Bearer <SERVICE_ROLE_KEY>
//     - status:   Authorization: Bearer <user JWT>
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// `SUPABASE_URL` внутри контейнера = `http://gateway:8080` (внутренний хост, недоступный
// браузеру). Для внешних ссылок (signed download URL) используем APP_URL — публичный
// хост, через который юзер заходит. Caddy прокидывает /storage/v1/* на тот же gateway.
const publicAppUrl = Deno.env.get("APP_URL") ?? "";

const EXPORT_BUCKET = "user-exports";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 час. Пока TTL файла в БД — 24ч.

// Переписывает host в signed URL c internal (`http://gateway:8080`) на публичный
// APP_URL, чтобы линк был кликабельным из браузера. Если APP_URL не задан или
// URL не парсится — возвращаем оригинал (лучше нерабочая ссылка, чем 500).
const rewriteSignedUrlHost = (signedUrl: string): string => {
  if (!publicAppUrl) return signedUrl;
  try {
    const parsed = new URL(signedUrl);
    const publicBase = new URL(publicAppUrl);
    // Replace each piece individually. Note: assigning `parsed.host` keeps the existing
    // port when the new value omits one — that's why naive `host = publicBase.host` left
    // `:8080` from the internal gateway URL bleeding through. Set hostname + port
    // separately and use `publicBase.port` (empty string when default 80/443 is used,
    // which clears the port on `parsed`).
    parsed.protocol = publicBase.protocol;
    parsed.hostname = publicBase.hostname;
    parsed.port = publicBase.port;
    return parsed.toString();
  } catch {
    return signedUrl;
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const buildExportPath = (userId: string, requestId: string) =>
  `${userId}/${requestId}.json`;

const collectExportPayload = async (
  client: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> => {
  // Весь payload собирается одним SECURITY DEFINER-вызовом, потому что `service_role`
  // в этом деплое имеет гранты не на все таблицы (см. миграцию 0077) — прямые SELECT
  // через PostgREST падают с `permission denied`.
  const { data, error } = await client.rpc("_collect_data_export_payload", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(`collect payload failed: ${error.message}`);
  }

  if (!data || typeof data !== "object") {
    throw new Error("collect payload returned empty response");
  }

  return data as Record<string, unknown>;
};

const handleGenerate = async (req: Request): Promise<Response> => {
  const authHeader = req.headers.get("authorization") ?? "";
  const providedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (providedKey !== serviceRoleKey) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: picked, error: pickError } = await supabaseAdmin.rpc("_pick_export_request");
  if (pickError) {
    return jsonResponse({ error: `Failed to pick request: ${pickError.message}` }, 500);
  }

  const row = Array.isArray(picked) ? picked[0] : picked;
  if (!row) {
    return jsonResponse({ status: "idle", message: "No pending exports." });
  }

  const { request_id: requestId, user_id: userId } = row as {
    request_id: string;
    user_id: string;
  };

  try {
    const payload = await collectExportPayload(supabaseAdmin, userId);
    const storagePath = buildExportPath(userId, requestId);

    const body = new TextEncoder().encode(JSON.stringify(payload));
    const { error: uploadError } = await supabaseAdmin.storage
      .from(EXPORT_BUCKET)
      .upload(storagePath, body, {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`storage upload failed: ${uploadError.message}`);
    }

    const { error: finalizeError } = await supabaseAdmin.rpc("_finalize_export_request", {
      request_id: requestId,
      new_status: "ready",
      file_path: storagePath,
    });

    if (finalizeError) {
      throw new Error(`finalize rpc failed: ${finalizeError.message}`);
    }

    return jsonResponse({
      status: "ready",
      requestId,
      userId,
      filePath: storagePath,
      bytes: body.byteLength,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await supabaseAdmin.rpc("_finalize_export_request", {
      request_id: requestId,
      new_status: "failed",
      error_message: message,
    });
    return jsonResponse({ status: "failed", requestId, userId, error: message }, 500);
  }
};

const handleStatus = async (req: Request): Promise<Response> => {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (!anonKey) {
    return jsonResponse({ error: "SUPABASE_ANON_KEY is not configured." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // get_data_export_status уже проверяет auth.uid() и отдаёт file_path только для status='ready'.
  const { data: status, error: rpcError } = await userClient.rpc("get_data_export_status");
  if (rpcError) {
    return jsonResponse({ error: rpcError.message }, 500);
  }

  const row = status as
    | null
    | {
      id?: string | null;
      status: string;
      file_path?: string | null;
      created_at?: string | null;
      ready_at?: string | null;
      expires_at?: string | null;
      error_message?: string | null;
    };

  if (!row || row.status === "none" || !row.id) {
    return jsonResponse({ hasRequest: false });
  }

  let downloadUrl: string | null = null;
  if (row.status === "ready" && row.file_path) {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(row.file_path, SIGNED_URL_TTL_SECONDS);
    if (!signError && signed?.signedUrl) {
      downloadUrl = rewriteSignedUrlHost(signed.signedUrl);
    }
  }

  return jsonResponse({
    hasRequest: true,
    requestId: row.id,
    status: row.status,
    createdAt: row.created_at,
    readyAt: row.ready_at,
    expiresAt: row.expires_at,
    errorMessage: row.error_message ?? null,
    downloadUrl,
  });
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service credentials are not configured." }, 500);
  }

  let action: string;
  try {
    const body = (await req.json()) as { action?: unknown };
    if (typeof body.action !== "string") {
      return jsonResponse({ error: "Missing `action` field" }, 400);
    }
    action = body.action;
  } catch (_error) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (action === "generate") {
    return handleGenerate(req);
  }

  if (action === "status") {
    return handleStatus(req);
  }

  return jsonResponse({ error: `Unknown action: ${action}` }, 400);
};

if (import.meta.main) {
  serve(handler);
}
