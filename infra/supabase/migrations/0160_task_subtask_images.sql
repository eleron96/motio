-- Pictures on a subtask. Files live where description pictures live — the
-- task-media function, the private bucket, `task_media` — and the subtask only
-- keeps references: `[{ "id": <task_media id>, "token": <view token> }, …]`.
-- The client builds the view URL from them, so a self-hosted instance that
-- moves to another domain keeps its subtask pictures. Readers and writers are
-- the ones the existing task_subtasks policies already allow; no new grants.
alter table public.task_subtasks
  add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.task_subtasks
  drop constraint if exists task_subtasks_images_shape;

alter table public.task_subtasks
  add constraint task_subtasks_images_shape check (
    jsonb_typeof(images) = 'array'
    and jsonb_array_length(images) <= 10
    and not jsonb_path_exists(
      images,
      '$[*] ? (!(@.type() == "object" && @.id.type() == "string" && @.token.type() == "string"))'
    )
  );

-- Media GC asks "does any subtask of this workspace still show this picture?"
-- with `images @> [{"id": …}]`.
create index if not exists task_subtasks_images_gin_idx
  on public.task_subtasks using gin (images jsonb_path_ops);
