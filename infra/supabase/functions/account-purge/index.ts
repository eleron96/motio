// Edge Function `account-purge` — финальный шаг удаления аккаунта.
// Триггерится cron-ом из backup-service (service_role key). Идемпотентна: повторный запуск
// на тех же профилях либо no-op (нечего брать), либо повторит провалившиеся.
//
// Контракт:
//   POST /functions/v1/account-purge
//   Authorization: Bearer <SERVICE_ROLE_KEY>
//   body (опционально): { "batchLimit": 50 }
//
// Флоу для каждого профиля:
//   1) `_pick_profiles_to_purge` — блокирует строки PENDING_DELETION с истёкшим purge_after.
//   2) Считаем email_hash (sha256 от lower(email)) ДО анонимизации.
//   3) Событие `purge_started`.
//   4) Storage:
//        а) `avatars/{user_id}/*` (listing + remove).
//        б) `task-media/*` по списку из public.task_media.storage_path (owner_id = user_id).
//   5) Keycloak delete (404 — ок).
//   6) `_finalize_profile_purge` — атомарная анонимизация auth.users+profiles + событие `purged`.
//   На любой фатальной ошибке (после шага 3) — событие `purge_failed`, профиль остаётся PENDING_DELETION
//   и подхватится на следующем cron-тике.
//
// Ответ: { processed, purged, failed, skipped, details: [...] }.
import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  deleteKeycloakUser,
  ensureKeycloakReady,
  getKeycloakConfig,
  type KeycloakConfig,
} from "../_shared/keycloak.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const AVATAR_BUCKET = "avatars";
const TASK_MEDIA_BUCKET = "task-media";

interface PurgeCandidate {
  user_id: string;
  email: string | null;
  purge_after: string;
}

interface PurgeDetail {
  userId: string;
  outcome: "purged" | "failed" | "skipped";
  error?: string;
  storageRemoved?: number;
  keycloakStatus?: "deleted" | "missing" | "error";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const hashEmail = async (email: string | null | undefined): Promise<string | null> => {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(normalized));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const removeAvatarFiles = async (
  client: SupabaseClient,
  userId: string,
): Promise<number> => {
  const { data: entries, error: listError } = await client.storage
    .from(AVATAR_BUCKET)
    .list(userId, { limit: 1000 });

  if (listError) {
    throw new Error(`avatars list failed: ${listError.message}`);
  }

  if (!entries || entries.length === 0) {
    return 0;
  }

  const paths = entries.map((entry) => `${userId}/${entry.name}`);
  const { error: removeError } = await client.storage.from(AVATAR_BUCKET).remove(paths);
  if (removeError) {
    throw new Error(`avatars remove failed: ${removeError.message}`);
  }
  return paths.length;
};

const removeTaskMediaForOwner = async (
  client: SupabaseClient,
  userId: string,
): Promise<number> => {
  const { data: rows, error } = await client
    .from("task_media")
    .select("storage_path")
    .eq("owner_id", userId)
    .not("storage_path", "is", null);

  if (error) {
    throw new Error(`task_media select failed: ${error.message}`);
  }

  const paths = (rows ?? [])
    .map((r) => (r as { storage_path: string | null }).storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  if (paths.length === 0) {
    return 0;
  }

  const { error: removeError } = await client.storage.from(TASK_MEDIA_BUCKET).remove(paths);
  if (removeError) {
    throw new Error(`task-media remove failed: ${removeError.message}`);
  }
  return paths.length;
};

const purgeCandidate = async (
  client: SupabaseClient,
  keycloakConfig: KeycloakConfig | null,
  candidate: PurgeCandidate,
): Promise<PurgeDetail> => {
  const userId = candidate.user_id;
  const emailHash = await hashEmail(candidate.email);

  // purge_started — фиксируем старт. Если процесс упадёт между шагами,
  // в audit будет видно, что мы начали, но не завершили.
  const { error: startedError } = await client.rpc("_log_account_deletion_event", {
    target_user_id: userId,
    event_type: "purge_started",
    email_hash: emailHash,
    metadata: { origin: "account-purge-edge" },
  });
  if (startedError) {
    return { userId, outcome: "failed", error: `log purge_started: ${startedError.message}` };
  }

  let storageRemoved = 0;
  let keycloakStatus: PurgeDetail["keycloakStatus"] = "missing";

  try {
    storageRemoved += await removeAvatarFiles(client, userId);
    storageRemoved += await removeTaskMediaForOwner(client, userId);

    if (keycloakConfig) {
      const result = await deleteKeycloakUser(keycloakConfig, userId);
      if ("error" in result && result.error) {
        throw new Error(`keycloak delete failed: ${result.error}`);
      }
      keycloakStatus = "deleted";
    }

    const { error: finalizeError } = await client.rpc("_finalize_profile_purge", {
      target_user_id: userId,
      email_hash: emailHash,
      metadata: {
        origin: "account-purge-edge",
        storage_removed: storageRemoved,
        keycloak: keycloakStatus,
      },
    });

    if (finalizeError) {
      throw new Error(`finalize rpc failed: ${finalizeError.message}`);
    }

    return { userId, outcome: "purged", storageRemoved, keycloakStatus };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await client.rpc("_log_account_deletion_event", {
      target_user_id: userId,
      event_type: "purge_failed",
      email_hash: emailHash,
      metadata: {
        origin: "account-purge-edge",
        error: message,
        storage_removed_before_failure: storageRemoved,
      },
    });
    return {
      userId,
      outcome: "failed",
      error: message,
      storageRemoved,
      keycloakStatus: keycloakStatus === "deleted" ? "deleted" : "error",
    };
  }
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

  const authHeader = req.headers.get("authorization") ?? "";
  const providedKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (providedKey !== serviceRoleKey) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let batchLimit = 50;
  try {
    const rawBody = await req.text();
    if (rawBody.length > 0) {
      const parsed = JSON.parse(rawBody) as { batchLimit?: unknown };
      if (typeof parsed.batchLimit === "number" && parsed.batchLimit > 0) {
        batchLimit = Math.min(Math.floor(parsed.batchLimit), 200);
      }
    }
  } catch (_error) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const keycloakConfig = getKeycloakConfig();
  const keycloakReady = ensureKeycloakReady(keycloakConfig);
  const keycloakForPurge = "error" in keycloakReady ? null : keycloakConfig;

  const { data: candidates, error: pickError } = await supabaseAdmin.rpc(
    "_pick_profiles_to_purge",
    { batch_limit: batchLimit },
  );

  if (pickError) {
    return jsonResponse(
      { error: `Failed to pick profiles: ${pickError.message}` },
      500,
    );
  }

  const rows = (candidates ?? []) as PurgeCandidate[];
  const details: PurgeDetail[] = [];

  for (const row of rows) {
    const detail = await purgeCandidate(supabaseAdmin, keycloakForPurge, row);
    details.push(detail);
  }

  const summary = details.reduce(
    (acc, detail) => {
      if (detail.outcome === "purged") acc.purged += 1;
      else if (detail.outcome === "failed") acc.failed += 1;
      else acc.skipped += 1;
      return acc;
    },
    { purged: 0, failed: 0, skipped: 0 },
  );

  return jsonResponse({
    processed: rows.length,
    ...summary,
    keycloakEnabled: keycloakForPurge !== null,
    details,
  });
};

if (import.meta.main) {
  serve(handler);
}
