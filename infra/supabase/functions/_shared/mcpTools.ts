/**
 * The tools of the Motio MCP server (Edge Function `mcp`): what a model sees
 * and how a call maps onto the read-only workspace API. Every tool reads; none
 * changes anything. Pure — no I/O — and unit-tested from vitest
 * (src/test/shared/mcpTools.test.ts). Reference: docs/mcp.md.
 */
import type { ReadRoute } from "./workspaceApi.ts";

/** What a tool call reads: a route of the workspace API, or the absences. */
export type McpToolTarget = ReadRoute | { kind: "time-off" };

type ArgumentType = "string" | "integer" | "boolean";

interface ToolArgument {
  type: ArgumentType;
  description: string;
}

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  arguments: Record<string, ToolArgument>;
  required?: string[];
}

const DATE = "a date, YYYY-MM-DD";

const RANGE: Record<string, ToolArgument> = {
  from: { type: "string", description: `First day of the range, ${DATE}.` },
  to: { type: "string", description: `Last day of the range, ${DATE}.` },
};

const PAGING: Record<string, ToolArgument> = {
  limit: { type: "integer", description: "Items per page, 1 to 500. Default 100." },
  cursor: { type: "string", description: "next_cursor of the previous page, with the same filters, to get the next one." },
};

const DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_workspace",
    title: "Workspace",
    description: "The Motio workspace this connection reads: its id and name.",
    arguments: {},
  },
  {
    name: "list_people",
    title: "People",
    description:
      "Everyone on the workspace timeline: name, account email and role, group, and whether the person is active. "
      + "The id is what tasks carry in assignee_ids.",
    arguments: {},
  },
  {
    name: "list_projects",
    title: "Projects",
    description: "Projects with their code, status, customer and whether they are archived.",
    arguments: {
      archived: { type: "boolean", description: "true: archived projects only; false: active only. Omit for both." },
    },
  },
  {
    name: "find_tasks",
    title: "Tasks",
    description:
      "Tasks of the workspace, ordered by start date. Narrow the search with filters: a date range (tasks that "
      + "overlap it), a project, a person. end_date is the last day of a task, inclusive. is_done and is_cancelled "
      + "say what the status means. The description is not included: use get_task for it.",
    arguments: {
      ...RANGE,
      project_id: { type: "string", description: "Only tasks of this project (an id from list_projects)." },
      assignee_id: { type: "string", description: "Only tasks assigned to this person (an id from list_people)." },
      updated_since: {
        type: "string",
        description: "Only tasks changed at or after this moment, with a time zone: 2026-11-01T09:00:00Z.",
      },
      ...PAGING,
    },
  },
  {
    name: "get_task",
    title: "Task",
    description: "One task with its description (HTML) and checklist.",
    arguments: { id: { type: "string", description: "The task id (from find_tasks)." } },
    required: ["id"],
  },
  {
    name: "list_milestones",
    title: "Milestones",
    description: "Project milestones ordered by date, optionally within a date range or for one project.",
    arguments: {
      ...RANGE,
      project_id: { type: "string", description: "Only milestones of this project (an id from list_projects)." },
      ...PAGING,
    },
  },
  {
    name: "list_time_off",
    title: "Time off",
    description:
      "Absences (vacation, sick leave, days off) that overlap a date range: who is away and when. "
      + "end_date is the last day off, inclusive.",
    arguments: { ...RANGE },
  },
];

/** A tool as MCP lists it (tools/list). */
export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: ArgumentType; description: string }>;
    required?: string[];
    additionalProperties: false;
  };
  annotations: { readOnlyHint: true; destructiveHint: false; idempotentHint: true; openWorldHint: false };
}

export const MCP_TOOLS: McpTool[] = DEFINITIONS.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: {
    type: "object",
    properties: tool.arguments,
    ...(tool.required ? { required: tool.required } : {}),
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));

// A model reads every row it asks for: a smaller page than the HTTP API's
// default keeps one answer from flooding its context.
const MCP_DEFAULT_LIMIT = "100";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ToolCallPlan =
  | { target: McpToolTarget; params: URLSearchParams }
  | { unknownTool: true }
  | { invalid: string };

const matchesType = (value: unknown, type: ArgumentType): boolean => {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
};

/**
 * What a tools/call reads and with which filters, as the query the workspace
 * API parses — so a tool and its HTTP endpoint check their input the same way.
 */
export const planToolCall = (name: unknown, args: unknown): ToolCallPlan => {
  const tool = DEFINITIONS.find((definition) => definition.name === name);
  if (!tool) return { unknownTool: true };
  if (args !== undefined && args !== null && (typeof args !== "object" || Array.isArray(args))) {
    return { invalid: "arguments must be an object" };
  }

  const given = (args ?? {}) as Record<string, unknown>;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(given)) {
    const argument = tool.arguments[key];
    if (!argument) return { invalid: `unknown argument: ${key}` };
    if (value === null || value === undefined) continue;
    if (!matchesType(value, argument.type)) return { invalid: `${key} must be ${argument.type === "integer" ? "an integer" : `a ${argument.type}`}` };
    params.set(key, String(value));
  }
  for (const key of tool.required ?? []) {
    if (!params.has(key)) return { invalid: `${key} is required` };
  }

  switch (tool.name) {
    case "get_workspace":
      return { target: { kind: "workspace" }, params };
    case "list_people":
      return { target: { kind: "members" }, params };
    case "list_projects":
      return { target: { kind: "projects" }, params };
    case "find_tasks":
      if (!params.has("limit")) params.set("limit", MCP_DEFAULT_LIMIT);
      return { target: { kind: "tasks" }, params };
    case "get_task": {
      const id = params.get("id") ?? "";
      if (!UUID.test(id)) return { invalid: "id must be a task id (UUID)" };
      return { target: { kind: "task", taskId: id.toLowerCase() }, params: new URLSearchParams() };
    }
    case "list_milestones":
      if (!params.has("limit")) params.set("limit", MCP_DEFAULT_LIMIT);
      return { target: { kind: "milestones" }, params };
    default:
      return { target: { kind: "time-off" }, params };
  }
};
