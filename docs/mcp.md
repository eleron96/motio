# MCP server

Motio has a built-in [Model Context Protocol](https://modelcontextprotocol.io)
server: an AI assistant that speaks MCP can read one workspace and answer
questions about it — who is busy next week, what is due on a project, who is on
vacation in December.

The server only reads. It cannot create, move or delete anything, and it sees
one workspace: the one its token belongs to.

It is the [workspace API](api.md) in another shape: the same token, the same
data, the same rules.

## Connecting

1. Turn the API on and create a token with the **Read the workspace** scope, as
   described in [Workspace API → Turning it on](api.md#turning-it-on). A token
   that only imports absences is refused.
2. Give your assistant the address and the token:

| | |
|---|---|
| Address | `https://<your Motio host>/functions/v1/mcp` |
| Transport | Streamable HTTP |
| Auth | the header `Authorization: Bearer motio_…` |

The server does not offer OAuth sign-in: it takes the workspace token and nothing
else. A client that can only connect through OAuth cannot use it.

In Claude Code:

```bash
claude mcp add --transport http motio https://planner.example.com/functions/v1/mcp --header "Authorization: Bearer $MOTIO_TOKEN"
```

Or in a project's `.mcp.json`, with the token kept in an environment variable
rather than in the file:

```json
{
  "mcpServers": {
    "motio": {
      "type": "http",
      "url": "https://planner.example.com/functions/v1/mcp",
      "headers": {
        "Authorization": "Bearer ${MOTIO_TOKEN}"
      }
    }
  }
}
```

Other MCP clients take the same two things — the address and the header — in
their own settings.

## What an assistant can ask

| Tool | Returns |
|---|---|
| `get_workspace` | the workspace's id and name |
| `list_people` | everyone on the timeline: name, account email and role, group, active or not |
| `list_projects` | projects with code, status, customer; `archived` narrows the list |
| `find_tasks` | tasks, filtered by date range, project, person or "changed since"; a page of 100 by default |
| `get_task` | one task with its description and checklist |
| `list_milestones` | milestones, optionally by date range or project |
| `list_time_off` | absences that overlap a date range |

The fields are those of the matching [API endpoints](api.md#reading-the-workspace).
Dates are `YYYY-MM-DD`; a task's or an absence's end date is its last day,
inclusive.

Things to try once it is connected:

- "Who has no tasks next week?"
- "What is due on the Harbour bridge project before the end of the month?"
- "Who is away in the first half of December, and which of their tasks fall on
  those days?"

## Limits

- 5 requests per second per IP, bursts up to 20; above that `429`.
- Requests up to 256 KB.
- No CORS and no requests from a browser origin: the server is meant for
  assistants that run on a server or on your computer.

## Protocol

For those writing a client. The endpoint accepts `POST` only, one JSON-RPC
request or notification per call, and answers with a single JSON object; it
opens no streams and keeps no sessions.

| | |
|---|---|
| Protocol versions | `2026-07-28`; for clients that open with `initialize`: `2025-11-25`, `2025-06-18`, `2025-03-26` |
| Methods | `server/discover`, `tools/list`, `tools/call`, `ping`; `initialize` for the older versions |
| Capabilities | `tools` |

A `2026-07-28` request carries its version and client capabilities in
`params._meta` and mirrors them into the `MCP-Protocol-Version`, `Mcp-Method`
and (for `tools/call`) `Mcp-Name` headers; a mismatch is answered with `400` and
the JSON-RPC error `-32020`. `server/discover` and `tools/list` carry caching
hints (`ttlMs` of an hour, `cacheScope: "public"`): the tools are the same for
every caller. An older client starts with `initialize` and is served by the
version it asks for; no session id is issued. Those older versions are not
listed by `server/discover` or by the "unsupported version" error, which name
only what a request in the modern shape may use.

Outside the protocol the server answers with plain HTTP statuses:

| HTTP | When |
|---|---|
| 401 | token missing, malformed, unknown or revoked |
| 403 | the token lacks the `read` scope, or the request carries a browser `Origin` |
| 405 | any method other than `POST` |
| 413 | body over 256 KB |
| 429 | rate limit; retry after a second |

A tool that cannot do what was asked — a bad date, an unknown task id — answers
with `isError: true` and a message the assistant can act on.

## Security notes

- The token is a secret: keep it in the assistant's configuration or an
  environment variable, never in a repository. One token per assistant makes
  revoking painless.
- A `read` token sees every task, description and account email of the
  workspace. Whatever the assistant reads may be sent on to the AI provider
  behind it: connect only assistants your company is allowed to share that with.
- Task titles, descriptions and notes are text written by the people in your
  workspace, and an assistant reads them as part of its conversation. A
  well-behaved assistant treats them as data; since this server cannot change
  anything, the worst a misleading note can do here is a wrong answer.
- Requests are logged with the tool name and the workspace, without tokens,
  emails or the questions asked.
