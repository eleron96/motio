/**
 * The workspace API as a whole (Edge Function `api`): every route, what scope
 * of a token each one needs, and the filters and paging of the read endpoints.
 * Pure — no I/O, no Deno globals — so it is unit-tested from vitest
 * (src/test/shared/workspaceApi.test.ts). The time-off routes and bodies are
 * parsed by timeOffApi.ts; the rules themselves live in the database
 * functions api_* (migrations 0156, 0187). Reference: docs/api.md.
 */
import { parseApiRoute, parseListQuery, type ApiRoute } from "./timeOffApi.ts";

/** What a token may do; chosen when it is created (workspace_api_tokens.scopes). */
export type ApiScope = "time_off" | "read";

export type ReadRoute =
  | { kind: "workspace" }
  | { kind: "members" }
  | { kind: "projects" }
  | { kind: "tasks" }
  | { kind: "task"; taskId: string }
  | { kind: "milestones" };

export type WorkspaceApiRoute = ApiRoute | ReadRoute;

export type WorkspaceApiRouteResult = WorkspaceApiRoute | { error: "not_found" | "method_not_allowed" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLLECTION_PATH = /^\/?api\/v1\/(workspace|members|projects|tasks|milestones)\/?$/;
const TASK_PATH = /^\/?api\/v1\/tasks\/([^/]+)\/?$/;

/** pathname as the function receives it: /api/v1/<resource>[/<id>]. */
export const parseWorkspaceApiRoute = (method: string, pathname: string): WorkspaceApiRouteResult => {
  const collection = pathname.match(COLLECTION_PATH);
  if (collection) {
    if (method !== "GET") return { error: "method_not_allowed" };
    return { kind: collection[1] as "workspace" | "members" | "projects" | "tasks" | "milestones" };
  }
  const task = pathname.match(TASK_PATH);
  if (task) {
    if (!UUID.test(task[1])) return { error: "not_found" };
    if (method !== "GET") return { error: "method_not_allowed" };
    return { kind: "task", taskId: task[1].toLowerCase() };
  }
  return parseApiRoute(method, pathname);
};

/**
 * The scopes that open a route: any one of them is enough. Absences can be
 * listed with either scope; changing them takes "time_off"; everything else
 * is "read".
 */
export const scopesForRoute = (route: WorkspaceApiRoute): ApiScope[] => {
  switch (route.kind) {
    case "list":
      return ["time_off", "read"];
    case "upsert":
    case "delete":
      return ["time_off"];
    default:
      return ["read"];
  }
};

export const isRouteAllowed = (route: WorkspaceApiRoute, tokenScopes: readonly string[]): boolean =>
  scopesForRoute(route).some((scope) => tokenScopes.includes(scope));

// ────────────────────────── paging ──────────────────────────

export const DEFAULT_PAGE_SIZE = 200;
export const MAX_PAGE_SIZE = 500;

/** Where the previous page ended: the sort date and the id of its last row. */
export type PageCursor = { date: string; id: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const encodeCursor = (cursor: PageCursor): string => `${cursor.date}_${cursor.id}`;

export const decodeCursor = (value: string): PageCursor | null => {
  const [date, id, ...rest] = value.split("_");
  if (rest.length > 0 || !date || !id || !ISO_DATE.test(date) || !UUID.test(id)) return null;
  return { date, id: id.toLowerCase() };
};

type PagingResult = { limit: number; after: PageCursor | null } | { error: string };

const parsePaging = (params: URLSearchParams): PagingResult => {
  const rawLimit = params.get("limit")?.trim();
  let limit = DEFAULT_PAGE_SIZE;
  if (rawLimit) {
    if (!/^\d{1,4}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > MAX_PAGE_SIZE) {
      return { error: `limit must be a number from 1 to ${MAX_PAGE_SIZE}` };
    }
    limit = Number(rawLimit);
  }
  const rawCursor = params.get("cursor")?.trim();
  if (!rawCursor) return { limit, after: null };
  const after = decodeCursor(rawCursor);
  return after ? { limit, after } : { error: "cursor is not one this API returned" };
};

/**
 * One page out of the rows the database returned for `limit + 1`: the extra
 * row only says that another page follows.
 */
export const toPage = <Row extends { id: string }>(
  rows: Row[],
  limit: number,
  sortDate: (row: Row) => string,
): { items: Row[]; next_cursor: string | null } => {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const more = rows.length > limit && last !== undefined;
  return { items, next_cursor: more ? encodeCursor({ date: sortDate(last), id: last.id }) : null };
};

// ────────────────────────── filters ──────────────────────────

const optionalUuid = (params: URLSearchParams, name: string): { value: string | null } | { error: string } => {
  const raw = params.get(name)?.trim();
  if (!raw) return { value: null };
  return UUID.test(raw) ? { value: raw.toLowerCase() } : { error: `${name} must be an id (UUID)` };
};

export type ProjectsQueryResult = { archived: boolean | null } | { error: string };

/** ?archived=true|false; without it both kinds are listed. */
export const parseProjectsQuery = (params: URLSearchParams): ProjectsQueryResult => {
  const raw = params.get("archived")?.trim().toLowerCase();
  if (!raw) return { archived: null };
  if (raw === "true") return { archived: true };
  if (raw === "false") return { archived: false };
  return { error: "archived must be true or false" };
};

export type MilestonesQuery = {
  from: string | null;
  to: string | null;
  projectId: string | null;
  limit: number;
  after: PageCursor | null;
};

export const parseMilestonesQuery = (params: URLSearchParams): MilestonesQuery | { error: string } => {
  const range = parseListQuery(params);
  if ("error" in range) return range;
  const project = optionalUuid(params, "project_id");
  if ("error" in project) return project;
  const paging = parsePaging(params);
  if ("error" in paging) return paging;
  return { ...range, projectId: project.value, ...paging };
};

export type TasksQuery = MilestonesQuery & {
  assigneeId: string | null;
  updatedSince: string | null;
};

// A full timestamp with a zone ("2026-11-01T09:00:00Z", "…+01:00"): without a
// zone the same text would mean different moments to the caller and to us.
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

export const parseTasksQuery = (params: URLSearchParams): TasksQuery | { error: string } => {
  const base = parseMilestonesQuery(params);
  if ("error" in base) return base;
  const assignee = optionalUuid(params, "assignee_id");
  if ("error" in assignee) return assignee;
  const rawSince = params.get("updated_since")?.trim() || null;
  if (rawSince && (!ISO_TIMESTAMP.test(rawSince) || Number.isNaN(new Date(rawSince).getTime()))) {
    return { error: "updated_since must be a timestamp with a time zone (2026-11-01T09:00:00Z)" };
  }
  return {
    ...base,
    assigneeId: assignee.value,
    updatedSince: rawSince ? new Date(rawSince).toISOString() : null,
  };
};
