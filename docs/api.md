# Workspace API

Motio has a small HTTP API for other systems. It does two things:

- **Reads a workspace**: people, projects, tasks, milestones and absences — for
  reports, dashboards and exports to the tools your company already uses.
- **Imports absences** (vacation, sick leave, training, days off) from the system
  where your company records them — time tracking, HR, payroll. Imported absences
  behave exactly like the ones people enter by hand: they shade the timeline, push
  the person's tasks out of those days and count in the workload heatmap.

The API cannot create or change tasks, projects, milestones or people.

An AI assistant can read the same data through the built-in
[MCP server](mcp.md), with the same token.

## Turning it on

1. The `web` image is built with `VITE_FEATURE_WORKSPACE_API=true` (see
   [Configuration](configuration.md#feature-flags)). Without it the settings
   section is hidden; the endpoint exists either way but needs a token.
2. A workspace admin opens **Workspace settings → API → Create token**, names it
   after the system that will use it, chooses what it may do (see
   [Scopes](#scopes)) and copies the token. It is shown **once**; Motio stores
   only its SHA-256 hash.
3. The token goes into the other system's configuration as a secret.

A workspace can have up to 10 active tokens. **Revoke** cuts a token off at once;
absences it imported stay.

## Scopes

What a token may do is chosen when it is created and cannot be changed later:
to give a system more or less, create a new token and revoke the old one.

| Scope | In the settings | Opens |
|---|---|---|
| `read` | Read the workspace | every `GET` endpoint below; changes nothing |
| `time_off` | Import absences | `GET`, `PUT` and `DELETE` on `/time-off` |

A token can have one scope or both. A request outside its scopes is answered
with `403` (`forbidden`). Tokens created before scopes existed have `time_off`
only: they keep doing exactly what they did.

## Basics

| | |
|---|---|
| Base URL | `https://<your Motio host>/functions/v1/api/v1` |
| Auth | `Authorization: Bearer motio_…` |
| Format | JSON in, JSON out, UTF-8 |
| Rate limit | 5 requests per second per IP, bursts up to 20; above that `429` |
| Request size | up to 256 KB and 500 items per request |
| Ids | UUIDs |
| Dates | `YYYY-MM-DD` |
| Timestamps | ISO 8601 in UTC with the offset written out and up to six decimal places: `2026-10-28T09:12:44.512+00:00`, `2026-09-19T15:08:16.800568+00:00` |

The API is meant for servers and scripts. It sends no CORS headers, so a browser
page cannot call it — which also keeps the token out of browsers.

A token belongs to one workspace, and every endpoint answers for that workspace
only: there is no way to name another one.

Query parameters an endpoint does not know are ignored, and of a repeated
parameter the first value counts: check the spelling of a filter that seems to
have no effect.

### Paging

`GET /tasks` and `GET /milestones` return one page at a time: `limit` items
(200 by default, 500 at most) and `next_cursor`. Pass it back as `cursor`, with
the same filters, to get the next page; `next_cursor` is `null` on the last one.
The other lists are short and come whole.

```bash
curl -s "https://planner.example.com/functions/v1/api/v1/tasks?limit=500&cursor=$NEXT_CURSOR" \
  -H "Authorization: Bearer $MOTIO_TOKEN"
```

### Matching people

An absence is attached to a person by **email**: the email of their Motio account,
compared case-insensitively. The person must be a member of the workspace. People
on the timeline without an account (external people) cannot be matched and come
back as `PERSON_NOT_FOUND`.

### What the API may touch

Every record you send carries an `external_id` — the id of the absence in your
system (up to 200 characters, unique within the workspace). The API creates and
updates records **by that id** and deletes only records that have one. Absences
people entered by hand in Motio have no `external_id`; the API never changes or
deletes them.

One person cannot have two overlapping absences. If an imported period overlaps
an existing one (imported or entered by hand), that item is rejected with
`OVERLAP`; nothing is merged or overwritten.

If someone edits an imported absence in Motio, the next import with the same
`external_id` overwrites the edit: your system stays the source of truth.

## Reading the workspace

All of these need the `read` scope.

### The workspace

```
GET /workspace
```

```json
{"id": "8d2f6c1e-…", "name": "Studio North"}
```

A cheap way to check that a token works and which workspace it belongs to.

### People

```
GET /members
```

Everyone on the timeline: members with an account and people added without one.

```json
{
  "items": [
    {
      "id": "5b7e0d11-…",
      "name": "Anna Becker",
      "email": "anna@example.com",
      "role": "editor",
      "group": "Design",
      "has_account": true,
      "is_active": true,
      "deactivated_at": null
    }
  ]
}
```

`id` is what tasks carry in `assignee_ids`. `email` and `role` (`admin`, `editor`,
`viewer`) are those of the person's account while it is a member of the
workspace. They are `null` for people without an account, and for someone who
has left the workspace but still has a row on the timeline (`has_account` stays
`true`). `group` is `null` when the person is in no group. `is_active` is `false`
for someone taken off the timeline; `deactivated_at` holds the moment when Motio
recorded it, and can be `null`.

### Projects

```
GET /projects?archived=true|false
```

Without `archived` both active and archived projects are listed.

```json
{
  "items": [
    {
      "id": "c41a9e70-…",
      "name": "Harbour bridge",
      "code": "HB",
      "color": "#3b82f6",
      "status": "In progress",
      "archived": false,
      "customer_id": "0e6b2a4d-…",
      "customer": "North",
      "created_at": "2026-09-02T08:15:00.000000+00:00"
    }
  ]
}
```

`status` is the free-text status from the project card; `code`, `status` and the
customer are `null` when not set.

### Tasks

```
GET /tasks?from=YYYY-MM-DD&to=YYYY-MM-DD&project_id=…&assignee_id=…&updated_since=…&limit=…&cursor=…
```

Every filter is optional:

| Filter | Selects |
|---|---|
| `from`, `to` | tasks that overlap the range (either bound alone works) |
| `project_id` | tasks of one project |
| `assignee_id` | tasks assigned to one person (an `id` from `/members`) |
| `updated_since` | tasks changed at or after a moment, e.g. `2026-11-01T09:00:00Z`; the time zone is required. An `updated_at` from a response can be sent back as it is, microseconds included — URL-encode its `+` as `%2B` |

Tasks come ordered by start date, [a page at a time](#paging):

```json
{
  "items": [
    {
      "id": "3f0c7a52-…",
      "title": "Structural review",
      "project_id": "c41a9e70-…",
      "assignee_ids": ["5b7e0d11-…"],
      "start_date": "2026-11-09",
      "end_date": "2026-11-13",
      "status_id": "9a1d4c02-…",
      "status": "In progress",
      "is_done": false,
      "is_cancelled": false,
      "type": "Review",
      "priority": "high",
      "tags": ["urgent"],
      "repeat_id": null,
      "created_at": "2026-10-28T09:12:44.512000+00:00",
      "updated_at": "2026-11-03T14:02:10.090000+00:00"
    }
  ],
  "next_cursor": null
}
```

`end_date` is the last day of the task, inclusive. `status` and `type` are the
names from the workspace settings; `is_done` and `is_cancelled` say what the
status means, whatever it is called: a finished task is `is_done`, a cancelled
one is `is_cancelled` and not `is_done`, anything else is neither. `priority` is `low`, `medium`, `high` or
`null`. Tasks of one repeating series share a `repeat_id`. `project_id` is `null`
for a task without a project, `assignee_ids` is empty for an unassigned one.

A deleted task simply stops appearing: to mirror tasks elsewhere, compare ids
rather than rely on `updated_since` alone.

### One task

```
GET /tasks/{id}
```

The same fields plus the description and the checklist:

```json
{
  "id": "3f0c7a52-…",
  "title": "Structural review",
  "description": "<p>Check the drawings against the survey.</p>",
  "subtasks": [
    {"title": "Check the drawings", "is_done": true},
    {"title": "Write up findings", "is_done": false}
  ]
}
```

`description` is HTML as written in the task card, or `null`. `404` when the
workspace has no task with this id. Comments and attachments are not part of
the API.

### Milestones

```
GET /milestones?from=YYYY-MM-DD&to=YYYY-MM-DD&project_id=…&limit=…&cursor=…
```

Ordered by date, [a page at a time](#paging):

```json
{
  "items": [
    {
      "id": "71c5e9aa-…",
      "project_id": "c41a9e70-…",
      "date": "2026-11-20",
      "title": "Handover",
      "note": null,
      "status": null,
      "include_in_workload": false,
      "updated_at": "2026-10-30T11:40:00.000000+00:00"
    }
  ],
  "next_cursor": null
}
```

`status` is `done`, `current` or `upcoming` when someone set it by hand, and
`null` when Motio derives it from the date.

## Absences

Listing needs `read` or `time_off`; creating, updating and deleting need
`time_off`.

### List absences

```
GET /time-off?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Both filters are optional and select absences that overlap the range. Returns all
absences of the workspace, imported or not (up to 5000), in one answer: this list
is not paged.

```bash
curl -s "https://planner.example.com/functions/v1/api/v1/time-off?from=2026-11-01&to=2026-11-30" \
  -H "Authorization: Bearer $MOTIO_TOKEN"
```

```json
{
  "items": [
    {
      "id": "3f0c7a52-…",
      "external_id": "hr-1042",
      "email": "anna@example.com",
      "person": "Anna Becker",
      "start_date": "2026-11-09",
      "end_date": "2026-11-13",
      "note": "Vacation",
      "updated_at": "2026-10-28T09:12:44.512000+00:00"
    }
  ]
}
```

`external_id` is `null` for absences entered by hand; `email` is `null` for
people without an account and for those who have left the workspace.

### Create or update absences

```
PUT /time-off
```

`POST` does the same. Body: `{"items": [...]}` (a bare array works too). Each item:

| Field | Required | |
|---|---|---|
| `external_id` | yes | id in your system |
| `email` | yes | the person's Motio account email |
| `start_date` | yes | first day off, `YYYY-MM-DD` |
| `end_date` | yes | last day off (inclusive), not before `start_date` |
| `note` | no | up to 1000 characters, visible to the team |

```bash
curl -s -X PUT "https://planner.example.com/functions/v1/api/v1/time-off" \
  -H "Authorization: Bearer $MOTIO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"external_id": "hr-1042", "email": "anna@example.com",
       "start_date": "2026-11-09", "end_date": "2026-11-13", "note": "Vacation"},
      {"external_id": "hr-1043", "email": "max@example.com",
       "start_date": "2026-11-10", "end_date": "2026-11-10", "note": "Training"}
    ]
  }'
```

Every item is handled on its own and gets a result, in the order sent. A bad
item never blocks the others; the request itself answers `200`:

```json
{
  "summary": {"created": 1, "updated": 0, "unchanged": 0, "error": 1},
  "results": [
    {"external_id": "hr-1042", "status": "created", "id": "3f0c7a52-…"},
    {"external_id": "hr-1043", "status": "error", "error": "PERSON_NOT_FOUND"}
  ]
}
```

| `status` | Meaning |
|---|---|
| `created` | new absence |
| `updated` | an absence with this `external_id` existed and changed |
| `unchanged` | it existed and already matched |
| `error` | not saved; see `error` |

| `error` | Meaning |
|---|---|
| `INVALID_EXTERNAL_ID` | missing, empty or longer than 200 characters |
| `INVALID_DATES` | not `YYYY-MM-DD`, not a real date, or end before start |
| `INVALID_NOTE` | note longer than 1000 characters |
| `PERSON_NOT_FOUND` | no workspace member with this account email |
| `OVERLAP` | the person already has an absence on some of these days |

Sending the same data again is safe: you get `unchanged`. A nightly job can send
the full list of upcoming absences every time.

### Delete an absence

```
DELETE /time-off/{external_id}
```

```bash
curl -s -X DELETE "https://planner.example.com/functions/v1/api/v1/time-off/hr-1042" \
  -H "Authorization: Bearer $MOTIO_TOKEN"
```

`204` when deleted, `404` when there is no imported absence with this id.
URL-encode ids with spaces or other special characters. An id that contains a
`/` cannot travel in a path — proxies decode or refuse it there — so pass it as a
parameter instead:

```
DELETE /time-off?external_id=hr%2F1042
```
 Removing absences that disappeared from your
system is up to the caller: list with `GET`, compare, delete.

## Errors

Request-level errors share one shape:

```json
{"error": {"code": "unauthorized", "message": "unknown or revoked workspace token"}}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_json` | body is not JSON |
| 401 | `unauthorized` | token missing, malformed, unknown or revoked |
| 403 | `forbidden` | the token lacks the scope this endpoint needs |
| 404 | `not_found` | unknown endpoint, no such task, or nothing to delete |
| 405 | `method_not_allowed` | wrong method for the endpoint |
| 413 | `payload_too_large` | body over 256 KB |
| 422 | `invalid_query` / `invalid_body` | a bad filter, `limit` or `cursor` (a date that does not exist counts); empty or oversized `items` |
| 429 | — | rate limit; retry after a second |
| 500 | `internal_error` | our side; retry later |

## Security notes

- Treat the token like a password: keep it in your secrets store, never in a
  repository or a browser.
- Give a token only the scope its system needs: a reporting tool reads, an HR
  sync imports absences. A `read` token sees every task, description and
  account email of the workspace.
- One token per system makes revoking painless. Each token shows when it was
  last used.
- Only workspace admins can create, see and revoke tokens. Tokens are stored as
  SHA-256 hashes; a database dump does not reveal them.
- Requests and results are logged without tokens and without emails.
