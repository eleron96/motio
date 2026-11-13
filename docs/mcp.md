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

The same address is shown in Motio: **Workspace settings → API → AI assistants**.

The server does not offer OAuth sign-in: it takes the workspace token and nothing
else. A client that can only connect through OAuth cannot use it.

### The quick way

In Motio, open **Workspace settings → API** and create a token with **Read the
workspace**. The window that shows the new token also shows ready text for your
assistant, with your address and the token already in it: pick the assistant,
copy, paste. The recipes below are the same text with an example address.

In each of them replace `planner.example.com` with your Motio address and
`motio_YOUR_TOKEN` with your token.

### Claude Code

Paste into a terminal:

```bash
claude mcp add --transport http motio https://planner.example.com/functions/v1/mcp --header "Authorization: Bearer motio_YOUR_TOKEN"
```

### Codex

Add to the file `~/.codex/config.toml`:

```toml
[mcp_servers.motio]
url = "https://planner.example.com/functions/v1/mcp"
http_headers = { "Authorization" = "Bearer motio_YOUR_TOKEN" }
```

### Gemini CLI

Paste into a terminal:

```bash
gemini mcp add --scope user --transport http --header "Authorization: Bearer motio_YOUR_TOKEN" motio https://planner.example.com/functions/v1/mcp
```

### Kimi Code

Add to the file `~/.kimi-code/mcp.json` (if it already lists other servers, put
`motio` next to them):

```json
{
  "mcpServers": {
    "motio": {
      "url": "https://planner.example.com/functions/v1/mcp",
      "headers": {
        "Authorization": "Bearer motio_YOUR_TOKEN"
      }
    }
  }
}
```

### Check that it works

Start the assistant and ask: "Which Motio workspace are you connected to?" It
should answer with the name of your workspace.

### Other assistants, and keeping the token out of files

Any MCP client takes the same two things — the address and the header — in its
own settings. The recipes above put the token straight into a command or a
settings file, which is the simplest; a command also stays in the terminal's
history. To keep the token in an environment variable instead, each client has
its own way: Claude Code expands `${MOTIO_TOKEN}` in a project's `.mcp.json`,
Codex takes `bearer_token_env_var = "MOTIO_TOKEN"`, Kimi Code takes
`"bearerTokenEnvVar": "MOTIO_TOKEN"`.

The recipes follow each client's own documentation as of November 2026. The
connection itself was tested with Claude Code and the official MCP client
library; if a recipe for another client no longer works, check that client's
documentation for the current spelling.

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
- Always connect over `https://`, and keep the token in the `Authorization`
  header: a token put into the address ends up in access logs.
- Creating and revoking a token is recorded in the workspace's history
  (**Members and access → History**).
- Requests are logged on the server with the tool name, the workspace and the
  short prefix of the token (the one shown in the settings), so it is clear
  which assistant asked. The token itself, emails, tool arguments and the
  questions asked are never logged.
