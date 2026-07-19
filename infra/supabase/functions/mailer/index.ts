import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createSupabaseClients } from "../_shared/supabaseAuth.ts";
import { captureException } from "../_shared/sentryCapture.ts";
import { checkSmtpConnection, getMailerConfig, sendEmail } from "../_shared/mailer.ts";
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

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return handleMailer(req);
};

if (import.meta.main) {
  serve(handler);
}
