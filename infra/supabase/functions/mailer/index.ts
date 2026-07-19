import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createSupabaseClients } from "../_shared/supabaseAuth.ts";
import { captureException } from "../_shared/sentryCapture.ts";
import {
  checkSmtpConnection,
  getMailerConfig,
  sendEmail,
  verifyUnsubscribeSignature,
} from "../_shared/mailer.ts";
import { renderWelcomeEmail, type WelcomeLocale } from "../_shared/welcomeEmail.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const appUrl = Deno.env.get("APP_URL") ?? "";
const welcomeEnabled = (Deno.env.get("MAILER_WELCOME_ENABLED") ?? "") === "true";

const { supabaseAdmin } = createSupabaseClients(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MailerAction = "welcome" | "smtpCheck";

interface MailerPayload {
  action?: MailerAction;
}

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

const resolveDisplayName = (displayName: string | null, email: string) => {
  const trimmed = (displayName ?? "").trim();
  if (trimmed) return trimmed;
  const localPart = email.split("@")[0] ?? "";
  return localPart || email;
};

const handleWelcome = async (userId: string) => {
  if (!welcomeEnabled) {
    return jsonResponse({ sent: false, reason: "disabled" });
  }

  // Atomic claim: only the caller that flips NULL -> now() sends the email.
  // Concurrent requests (several tabs on first sign-in) lose the UPDATE and
  // exit here, so exactly one greeting goes out.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("id", userId)
    .is("welcome_email_sent_at", null)
    .select("email, display_name, locale")
    .maybeSingle();

  if (claimError) {
    return jsonResponse({ error: claimError.message }, 400);
  }
  if (!claimed) {
    return jsonResponse({ sent: false, reason: "already-sent" });
  }

  const locale: WelcomeLocale = claimed.locale === "ru" ? "ru" : "en";
  const email = renderWelcomeEmail({
    locale,
    name: resolveDisplayName(claimed.display_name, claimed.email),
    appUrl,
  });

  try {
    const { dryRun } = await sendEmail(getMailerConfig(), {
      to: claimed.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    return jsonResponse({ sent: !dryRun, dryRun });
  } catch (sendError) {
    // Release the claim so the next sign-in retries the send.
    const { error: rollbackError } = await supabaseAdmin
      .from("profiles")
      .update({ welcome_email_sent_at: null })
      .eq("id", userId);
    if (rollbackError) {
      captureException(rollbackError, { tags: { function: "mailer", stage: "welcome-rollback" } });
    }
    captureException(sendError, { tags: { function: "mailer", stage: "welcome-send" } });
    return jsonResponse({ error: "Failed to send welcome email" }, 502);
  }
};

const handleSmtpCheck = async () => {
  const config = getMailerConfig();
  // Diagnostics should probe the real connection even in dry-run mode; only
  // a missing host (local dev) makes the check a no-op.
  if (!config.host) {
    return jsonResponse({ ok: true, dryRun: true });
  }
  try {
    const { greeting } = await checkSmtpConnection(config);
    return jsonResponse({ ok: true, greeting });
  } catch (checkError) {
    captureException(checkError, { tags: { function: "mailer", stage: "smtp-check" } });
    return jsonResponse({ ok: false, error: String(checkError) }, 502);
  }
};

const handleMailer = async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authResult = await getAuthUser(req);
  if ("error" in authResult) {
    return jsonResponse({ error: authResult.error }, authResult.status ?? 401);
  }

  let payload: MailerPayload;
  try {
    payload = (await req.json()) as MailerPayload;
  } catch (_parseError) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  switch (payload.action) {
    case "welcome":
      return handleWelcome(authResult.user.id);
    case "smtpCheck":
      return handleSmtpCheck();
    default:
      return jsonResponse({ error: "Unknown action" }, 400);
  }
};

// Public one-click unsubscribe target from broadcast emails. No login: a
// valid HMAC over the user id (built with the service-role key) is the
// authorization. Always answers with a human page, never JSON.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const unsubscribePage = (locale: string, ok: boolean) => {
  const ru = locale === "ru";
  const title = ok
    ? (ru ? "Вы отписаны" : "You are unsubscribed")
    : (ru ? "Ссылка недействительна" : "This link is not valid");
  const detail = ok
    ? (ru
      ? "Новости Motio больше не будут приходить на вашу почту. Передумаете — включите их в настройках аккаунта."
      : "Motio product news will no longer be sent to your inbox. Changed your mind? Re-enable it in account settings.")
    : (ru
      ? "Похоже, ссылка повреждена или устарела. Отписаться можно в настройках аккаунта."
      : "The link looks broken or outdated. You can unsubscribe in your account settings.");
  return new Response(
    `<!doctype html><html lang="${ru ? "ru" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:48px 16px;background:#f6f5f3;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1f1d1a;">
<div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e5e2dd;border-radius:12px;padding:32px;text-align:center;">
<p style="margin:0 0 16px;font-size:20px;font-weight:700;">Motio</p>
<p style="margin:0 0 8px;font-size:17px;font-weight:600;">${title}</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#6b665f;">${detail}</p>
</div></body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
};

const handleUnsubscribe = async (req: Request) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("uid") ?? "";
  const signature = url.searchParams.get("sig") ?? "";

  if (!UUID_RE.test(userId) || !(await verifyUnsubscribeSignature(userId, signature))) {
    return unsubscribePage("en", false);
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ marketing_emails_opt_in: false })
    .eq("id", userId)
    .select("locale")
    .maybeSingle();

  if (error) {
    captureException(new Error(`unsubscribe failed: ${error.message}`), {
      tags: { function: "mailer", stage: "unsubscribe" },
    });
    return unsubscribePage("en", false);
  }

  return unsubscribePage(data?.locale === "ru" ? "ru" : "en", true);
};

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "unsubscribe") {
      return handleUnsubscribe(req);
    }
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  return handleMailer(req);
};

if (import.meta.main) {
  serve(handler);
}
