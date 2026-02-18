import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { handler as adminHandler } from "../admin/index.ts";
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
  invite: inviteHandler,
  notifications: notificationsHandler,
  "task-media": taskMediaHandler,
};

serve((req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/+/, "");
  const [name] = path.split("/");
  const handler = name ? handlers[name] : undefined;
  if (!handler) return jsonNotFound();
  return handler(req);
});
