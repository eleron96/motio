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
- the function redirects to a short-lived signed Storage URL on the public app origin, not to an internal Docker hostname,
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

## Scenario 5: Removing an image from a task description

Given:
- a task description references media id `m1`,
- the same media id is not referenced by any other task the user can see.

When:
- the user edits the description to drop the image,
- the planner store saves the new description via `updateTask`.

Then:
- after the DB update succeeds, the store diffs the old and new descriptions and collects `m1` as a removed id,
- the store filters out ids that are still referenced by any task in the in-memory state (so duplicate embeds in sibling tasks survive),
- it calls `DELETE /functions/v1/task-media/m1` fire-and-forget,
- the edge function verifies the caller is either the owner or a workspace admin,
- the binary is removed from Storage bucket `task-media` and the row is deleted from `public.task_media`,
- if the cleanup request fails, the task save itself is not rolled back — the orphan is tolerated until a future scan.

## Scenario 6: Deleting a task with embedded images

Given:
- a task carries two images (`m1`, `m2`),
- `m2` is also referenced by a sibling task.

When:
- the user deletes the task via `deleteTask` / `deleteTasks` / `deleteTaskSeries`.

Then:
- the store fetches descriptions for the about-to-be-deleted rows *before* issuing the DELETE, so media ids remain recoverable even after the task rows are gone,
- after the DB delete succeeds, the store schedules cleanup for the collected ids,
- only ids no longer referenced by any remaining task are sent to `DELETE /functions/v1/task-media/:id` (so `m2` is kept, `m1` is deleted),
- the edge function removes the blob and the row; failures are logged but do not resurrect the task.

## Scenario 7: Unauthorized delete

Given:
- the caller is neither the media owner nor a workspace admin.

When:
- the client calls `DELETE /functions/v1/task-media/:id`.

Then:
- the function responds with `403 Forbidden`,
- the Storage blob and the `public.task_media` row remain intact.
