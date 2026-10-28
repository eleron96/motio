# Workspace API: importing absences

Motio has a small HTTP API for one job: keeping absences (vacation, sick leave,
training, days off) in sync with the system where your company already records
them — time tracking, HR, payroll. Imported absences behave exactly like the ones
people enter by hand: they shade the timeline, push the person's tasks out of
those days and count in the workload heatmap.

The API cannot read or change anything else: no tasks, projects or people.

## Turning it on

1. The `web` image is built with `VITE_FEATURE_WORKSPACE_API=true` (see
   [Configuration](configuration.md#feature-flags)). Without it the settings
   section is hidden; the endpoint exists either way but needs a token.
2. A workspace admin opens **Workspace settings → API → Create token**, names it
   after the system that will use it and copies the token. It is shown **once**;
   Motio stores only its SHA-256 hash.
3. The token goes into the other system's configuration as a secret.

A workspace can have up to 10 active tokens. **Revoke** cuts a token off at once;
absences it imported stay.

## Basics

| | |
|---|---|
| Base URL | `https://<your Motio host>/functions/v1/api/v1` |
| Auth | `Authorization: Bearer motio_…` |
| Format | JSON in, JSON out, UTF-8 |
| Rate limit | 5 requests per second per IP, bursts up to 20; above that `429` |
| Request size | up to 256 KB and 500 items per request |

The API is meant for servers and scripts. It sends no CORS headers, so a browser
page cannot call it — which also keeps the token out of browsers.

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

## Endpoints

### List absences

```
GET /time-off?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Both filters are optional and select absences that overlap the range. Returns all
absences of the workspace, imported or not (up to 5000):

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
      "updated_at": "2026-10-28T09:12:44.512Z"
    }
  ]
}
```

`external_id` is `null` for absences entered by hand; `email` is `null` for
people without an account.

### Create or update absences

```
PUT /time-off
```

Body: `{"items": [...]}` (a bare array works too). Each item:

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
URL-encode ids with `/` or spaces. Removing absences that disappeared from your
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
| 404 | `not_found` | unknown endpoint, or nothing to delete |
| 405 | `method_not_allowed` | wrong method for the endpoint |
| 413 | `payload_too_large` | body over 256 KB |
| 422 | `invalid_query` / `invalid_body` | bad `from`/`to`, empty or oversized `items` |
| 429 | — | rate limit; retry after a second |
| 500 | `internal_error` | our side; retry later |

## Security notes

- Treat the token like a password: keep it in your secrets store, never in a
  repository or a browser.
- One token per system makes revoking painless. Each token shows when it was
  last used.
- Only workspace admins can create, see and revoke tokens. Tokens are stored as
  SHA-256 hashes; a database dump does not reveal them.
- Requests and results are logged without tokens and without emails.
