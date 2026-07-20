import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createSupabaseClients } from "../_shared/supabaseAuth.ts";
import { captureException } from "../_shared/sentryCapture.ts";
import { PUSH_ACTIONS } from "../_shared/actions.ts";
import { isPushConfigured, sendWebPush, type PushSubscriptionRecord } from "../_shared/pushSender.ts";
import {
  renderNotificationPush,
  renderTestPush,
  type NotificationPushType,
  type PushLocale,
} from "../_shared/pushPayload.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const appUrl = Deno.env.get("APP_URL") ?? "";

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  action?: string;
}

// Which per-event preference (in profiles.preferences) governs each notification
// type. Missing key defaults to enabled.
const PREF_KEY_BY_TYPE: Record<string, string> = {
  task_assigned: "push_on_assignment",
  comment_mention: "push_on_mention",
  task_updated: "push_on_task_change",
  deadline_approaching: "push_on_deadline",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getAuthUser = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return { error: "Unauthorized", status: 401 };

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return { error: "Unauthorized", status: 401 };
  }

  return { user: authData.user };
};

const isServiceRole = (req: Request): boolean => {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  return Boolean(token) && token === serviceRoleKey;
};

// Deliver a payload to every subscription of a user, pruning any the push
// service reports as gone (404/410). Returns the delivered count.
const deliverToUser = async (
  userId: string,
  payload: Record<string, unknown>,
  stage: string,
): Promise<number> => {
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    captureException(new Error(`load subscriptions failed: ${error.message}`), {
      tags: { function: "push", stage },
    });
    return 0;
  }
  if (!subs || subs.length === 0) return 0;

  let sent = 0;
  const pruneIds: string[] = [];
  for (const sub of subs as PushSubscriptionRecord[]) {
    const result = await sendWebPush(sub, payload);
    if (result.ok) {
      sent += 1;
    } else if (result.gone) {
      pruneIds.push(sub.id);
    } else {
      console.error(`[push:${stage}] send failed status=${result.status ?? "?"} error=${result.error}`);
      captureException(new Error(`push send failed (${result.status}): ${result.error}`), {
        tags: { function: "push", stage },
      });
    }
  }

  if (pruneIds.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", pruneIds);
  }

  console.log(`[push:${stage}] delivered=${sent}/${subs.length} pruned=${pruneIds.length}`);
  return sent;
};

// Send a test push to the caller's own devices — the one-click way to confirm
// permission + service worker + transport all work end to end.
const handleTest = async (userId: string) => {
  if (!isPushConfigured()) {
    return jsonResponse({ error: "Push notifications are not configured on the server." }, 503);
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("locale")
    .eq("id", userId)
    .maybeSingle();

  const locale: PushLocale = profile?.locale === "ru" ? "ru" : "en";
  const sent = await deliverToUser(userId, renderTestPush(locale, appUrl), "test");
  return jsonResponse({ sent });
};

interface ClaimedNotification {
  id: string;
  recipient_user_id: string;
  actor_user_id: string | null;
  type: string;
  workspace_id: string | null;
  task_id: string | null;
  task_title_snapshot: string;
  comment_preview: string | null;
}

interface RecipientProfile {
  displayName: string | null;
  locale: string | null;
  optIn: boolean;
  prefs: Record<string, unknown>;
}

// Drain a batch of pending notifications and deliver each as a push, honouring
// the recipient's master opt-in and per-event preference at send time. Invoked
// by the backup-service ticker with the service-role bearer.
const handleFlush = async () => {
  if (!isPushConfigured()) {
    return jsonResponse({ processed: 0, sent: 0, done: true });
  }

  const BATCH = 100;
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_push_notifications", {
    p_limit: BATCH,
  });
  if (claimError) {
    captureException(new Error(`claim failed: ${claimError.message}`), {
      tags: { function: "push", stage: "flush" },
    });
    return jsonResponse({ error: claimError.message }, 500);
  }

  const rows = (claimed ?? []) as ClaimedNotification[];
  if (rows.length === 0) {
    return jsonResponse({ processed: 0, sent: 0, done: true });
  }

  const recipientIds = [...new Set(rows.map((r) => r.recipient_user_id))];
  const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((v): v is string => Boolean(v)))];
  const profileIds = [...new Set([...recipientIds, ...actorIds])];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, locale, push_notifications_opt_in, preferences")
    .in("id", profileIds);

  const profileMap = new Map<string, RecipientProfile>();
  for (const p of profiles ?? []) {
    profileMap.set(p.id, {
      displayName: p.display_name ?? null,
      locale: p.locale ?? null,
      optIn: Boolean(p.push_notifications_opt_in),
      prefs: (p.preferences ?? {}) as Record<string, unknown>,
    });
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", recipientIds);

  const subsByUser = new Map<string, PushSubscriptionRecord[]>();
  for (const s of subs ?? []) {
    const list = subsByUser.get(s.user_id) ?? [];
    list.push({ id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    subsByUser.set(s.user_id, list);
  }

  let sent = 0;
  const pruneIds: string[] = [];

  for (const row of rows) {
    const recipient = profileMap.get(row.recipient_user_id);
    if (!recipient || !recipient.optIn) continue;

    const prefKey = PREF_KEY_BY_TYPE[row.type];
    if (prefKey && recipient.prefs[prefKey] === false) continue;

    const userSubs = subsByUser.get(row.recipient_user_id);
    if (!userSubs || userSubs.length === 0) continue;

    const actorName = row.actor_user_id
      ? (profileMap.get(row.actor_user_id)?.displayName ?? null)
      : null;
    const locale: PushLocale = recipient.locale === "ru" ? "ru" : "en";
    const payload = renderNotificationPush(
      locale,
      {
        type: row.type as NotificationPushType,
        actorName,
        taskTitle: row.task_title_snapshot,
        commentPreview: row.comment_preview,
      },
      { taskId: row.task_id, workspaceId: row.workspace_id },
      appUrl,
    );

    for (const sub of userSubs) {
      const result = await sendWebPush(sub, payload);
      if (result.ok) {
        sent += 1;
      } else if (result.gone) {
        pruneIds.push(sub.id);
      } else {
        console.error(`[push:flush] send failed status=${result.status ?? "?"} error=${result.error}`);
        captureException(new Error(`push flush send failed (${result.status}): ${result.error}`), {
          tags: { function: "push", stage: "flush" },
        });
      }
    }
  }

  if (pruneIds.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", [...new Set(pruneIds)]);
  }

  const done = rows.length < BATCH;
  console.log(`[push:flush] processed=${rows.length} sent=${sent} pruned=${pruneIds.length} done=${done}`);
  return jsonResponse({ processed: rows.length, sent, done });
};

// Create 'deadline_approaching' notifications for tasks due today/tomorrow. The
// flush pass then delivers them. Idempotent (one reminder per task). Invoked by
// the daily ticker with the service-role bearer.
const handleDeadlinesScan = async () => {
  const { data, error } = await supabaseAdmin.rpc("scan_upcoming_deadlines");
  if (error) {
    captureException(new Error(`deadline scan failed: ${error.message}`), {
      tags: { function: "push", stage: "deadlines" },
    });
    return jsonResponse({ error: error.message }, 500);
  }
  const created = typeof data === "number" ? data : 0;
  console.log(`[push:deadlines] created=${created}`);
  return jsonResponse({ created });
};

const handlePush = async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: PushPayload;
  try {
    payload = (await req.json()) as PushPayload;
  } catch (_parseError) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Service-role (cron) actions: gated by the service-role bearer, no user
  // session — mirrors the broadcasts.tick pattern.
  if (payload.action === PUSH_ACTIONS.FLUSH || payload.action === PUSH_ACTIONS.DEADLINES_SCAN) {
    if (!isServiceRole(req)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    return payload.action === PUSH_ACTIONS.FLUSH ? handleFlush() : handleDeadlinesScan();
  }

  // User (JWT) actions.
  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status ?? 401);
  }

  switch (payload.action) {
    case PUSH_ACTIONS.TEST:
      return handleTest(authResult.user.id);
    default:
      return jsonResponse({ error: "Unknown action" }, 400);
  }
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return handlePush(req);
};

if (import.meta.main) {
  serve(handler);
}
