import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { captureException } from "../_shared/sentryCapture.ts";
import { handler as adminHandler } from "../admin/index.ts";
import { handler as holidaysHandler } from "../holidays/index.ts";
import { handler as inboxHandler } from "../inbox/index.ts";
import { handler as inviteHandler } from "../invite/index.ts";
import { handler as notificationsHandler } from "../notifications/index.ts";
import { handler as taskMediaHandler } from "../task-media/index.ts";

const jsonNotFound = () =>
  new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });

const handlers: Record<string, (req: Request) => Promise<Response>> = {
  admin: adminHandler,
  holidays: holidaysHandler,
  inbox: inboxHandler,
  invite: inviteHandler,
  notifications: notificationsHandler,
  "task-media": taskMediaHandler,
};

serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/+/, "");
  const [name] = path.split("/");
  const handler = name ? handlers[name] : undefined;
  if (!handler) return jsonNotFound();
  try {
    return await handler(req);
  } catch (err) {
    captureException(err, { tags: { function: name } });
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
