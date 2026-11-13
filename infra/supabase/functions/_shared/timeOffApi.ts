/**
 * Request parsing for the workspace API (Edge Function `api`): routes, the
 * bearer token, list filters and the upsert body. Pure — no I/O, no Deno
 * globals — so it is unit-tested from vitest (src/test/shared/timeOffApi.test.ts).
 *
 * The business rules (matching people, overlap, what counts as unchanged) live
 * in the database functions api_* (migration 0156).
 */

export const MAX_UPSERT_ITEMS = 500;
export const MAX_BODY_BYTES = 256 * 1024;

export type ApiRoute =
  | { kind: "list" }
  | { kind: "upsert" }
  | { kind: "delete"; externalId: string };

export type ApiRouteResult = ApiRoute | { error: "not_found" | "method_not_allowed" };

const MAX_EXTERNAL_ID_LENGTH = 200;

const TIME_OFF_PATH = /^\/?api\/v1\/time-off\/?$/;
const TIME_OFF_ITEM_PATH = /^\/?api\/v1\/time-off\/([^/]+)\/?$/;

/**
 * pathname as the function receives it: /api/v1/time-off[/<external_id>].
 * A record is deleted by its id in the path or in ?external_id= — the second
 * form is for ids with a slash, which proxies decode or refuse inside a path.
 */
export const parseApiRoute = (method: string, pathname: string, params?: URLSearchParams): ApiRouteResult => {
  if (TIME_OFF_PATH.test(pathname)) {
    if (method === "GET") return { kind: "list" };
    if (method === "PUT" || method === "POST") return { kind: "upsert" };
    if (method === "DELETE" && params?.has("external_id")) {
      const externalId = params.get("external_id") ?? "";
      if (!externalId || externalId.length > MAX_EXTERNAL_ID_LENGTH) return { error: "not_found" };
      return { kind: "delete", externalId };
    }
    return { error: "method_not_allowed" };
  }
  const item = pathname.match(TIME_OFF_ITEM_PATH);
  if (item) {
    if (method !== "DELETE") return { error: "method_not_allowed" };
    let externalId: string;
    try {
      externalId = decodeURIComponent(item[1]);
    } catch {
      return { error: "not_found" };
    }
    if (!externalId || externalId.length > MAX_EXTERNAL_ID_LENGTH) return { error: "not_found" };
    return { kind: "delete", externalId };
  }
  return { error: "not_found" };
};

const TOKEN_PATTERN = /^motio_[0-9a-f]{64}$/;

/** The workspace token from "Authorization: Bearer motio_…", or null. */
export const parseBearerToken = (header: string | null): string | null => {
  const match = (header ?? "").match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) return null;
  return TOKEN_PATTERN.test(match[1]) ? match[1] : null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar day the database can hold: YYYY-MM-DD, years 0001 to 9999.
 * Year 0000 passes JavaScript and fails in PostgreSQL, so it is refused here.
 */
export const isIsoDate = (value: string) => {
  if (!ISO_DATE.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export type ListQueryResult = { from: string | null; to: string | null } | { error: string };

/** Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD filters for the list. */
export const parseListQuery = (params: URLSearchParams): ListQueryResult => {
  const from = params.get("from")?.trim() || null;
  const to = params.get("to")?.trim() || null;
  if (from && !isIsoDate(from)) return { error: "from must be a date (YYYY-MM-DD)" };
  if (to && !isIsoDate(to)) return { error: "to must be a date (YYYY-MM-DD)" };
  if (from && to && to < from) return { error: "to must not be earlier than from" };
  return { from, to };
};

export type UpsertBodyResult = { items: unknown[] } | { error: string };

/**
 * The upsert body: {"items": [...]} or a bare array. Each item is checked by
 * the database function, which reports problems per item; here only the shape
 * of the request is checked.
 */
export const parseUpsertBody = (body: unknown): UpsertBodyResult => {
  const items = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
      ? (body as { items: unknown[] }).items
      : null;
  if (!items) return { error: "body must be {\"items\": [...]} or an array" };
  if (items.length === 0) return { error: "items must not be empty" };
  if (items.length > MAX_UPSERT_ITEMS) return { error: `at most ${MAX_UPSERT_ITEMS} items per request` };
  return { items };
};

/** Hex SHA-256 of the token: what the database stores and looks up. */
export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
