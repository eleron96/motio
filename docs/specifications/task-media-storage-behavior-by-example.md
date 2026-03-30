# Task Media Storage Behavior By Example

## Context

Task comment images are uploaded through the `task-media` Edge Function.
The editor stores only the function URL in `tasks.description`.

Current storage model:
- metadata and quota counters live in `public.task_media`,
- binary payloads live in the private Supabase Storage bucket `task-media`,
- legacy rows may still contain `content bytea` until the one-off migration script finishes.

## Scenario 1: Uploading a new image

Given:
- the user is authenticated,
- the user has access to the workspace,
- file size and quota limits allow the upload.

When:
- the client sends `POST /functions/v1/task-media` with an image payload.

Then:
- the function uploads the binary into Storage bucket `task-media`,
- the function inserts a row into `public.task_media` with `byte_size`, token metadata, and `storage_path`,
- file names with Cyrillic or other non-ASCII characters are transmitted in an ASCII-safe header form and restored before metadata is saved,
- the function returns `{ id, token, expiresAt, byteSize }`,
- the editor stores the URL `/functions/v1/task-media/:id?token=...`.

## Scenario 2: Downloading a migrated image

Given:
- `public.task_media.storage_path` is filled,
- the caller provides a valid, non-revoked, non-expired token.

When:
- the client requests `GET /functions/v1/task-media/:id?token=...`.

Then:
- the function validates the access token,
- the function updates `last_accessed_at`,
- the function redirects to a short-lived signed Storage URL,
- Postgres is not used to stream the binary payload.

## Scenario 3: Downloading a legacy image before migration

Given:
- `public.task_media.storage_path` is empty,
- `public.task_media.content` still contains the old `bytea` payload,
- the caller provides a valid token.

When:
- the client requests `GET /functions/v1/task-media/:id?token=...`.

Then:
- the function still serves the image from `content bytea`,
- the old row remains readable until the one-off migration script moves it to Storage.

## Scenario 4: Migrating legacy rows

Given:
- old rows exist where `storage_path is null` and `content is not null`.

When:
- the operator runs `node infra/scripts/migrate-task-media-to-storage.mjs --env-file .env`.

Then:
- each legacy payload is uploaded into bucket `task-media`,
- the row is updated with `storage_path`,
- `content` is cleared to `null`,
- `byte_size` remains unchanged, so quota calculations keep working through `get_media_usage_bytes`.
