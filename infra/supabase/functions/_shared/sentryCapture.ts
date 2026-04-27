/**
 * Lightweight error reporter that sends Sentry-compatible envelopes
 * to a GlitchTip instance via plain fetch().
 *
 * No npm dependencies — works in Deno Edge Runtime out of the box.
 *
 * Usage:
 *   import { captureException } from "../_shared/sentryCapture.ts";
 *   captureException(error, { tags: { function: "inbox" } });
 */

const DSN = Deno.env.get("GLITCHTIP_DSN") ?? "";

interface ParsedDsn {
  publicKey: string;
  host: string;
  projectId: string;
}

let parsed: ParsedDsn | null = null;

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace("/", "");
    const host = `${url.protocol}//${url.host}`;
    return { publicKey, host, projectId };
  } catch {
    return null;
  }
}

function getParsedDsn(): ParsedDsn | null {
  if (parsed) return parsed;
  if (!DSN) return null;
  parsed = parseDsn(DSN);
  return parsed;
}

interface CaptureOptions {
  tags?: Record<string, string>;
}

export function captureException(error: unknown, options?: CaptureOptions): void {
  const dsn = getParsedDsn();
  if (!dsn) return;

  const err = error instanceof Error ? error : new Error(String(error));

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level: "error",
    server_name: "edge-functions",
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack
            ? {
                frames: err.stack
                  .split("\n")
                  .slice(1, 20)
                  .map((line: string) => ({ filename: line.trim() })),
              }
            : undefined,
        },
      ],
    },
    tags: options?.tags ?? {},
  };

  const storeUrl = `${dsn.host}/api/${dsn.projectId}/store/?sentry_version=7&sentry_key=${dsn.publicKey}`;

  // Fire-and-forget — never block the response
  fetch(storeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => {
    // Silently ignore — error tracker failure must never affect the app
  });
}
