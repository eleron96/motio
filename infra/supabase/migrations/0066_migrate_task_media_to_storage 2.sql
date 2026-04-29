-- Step 1: Create the task-media bucket (private — access only through Edge Function signed URLs).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'public'
  ) then
    execute $sql$
      insert into storage.buckets (id, name, public)
      values ('task-media', 'task-media', false)
      on conflict (id) do nothing
    $sql$;
  else
    insert into storage.buckets (id, name)
    values ('task-media', 'task-media')
    on conflict (id) do nothing;
  end if;
end
$$;

-- Step 2: RLS for task-media bucket.
-- Only service_role can read/write. All access goes through the Edge Function.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Service role manages task-media'
  ) then
    execute $policy$
      create policy "Service role manages task-media"
        on storage.objects for all
        using (
          bucket_id = 'task-media'
          and auth.role() = 'service_role'
        )
        with check (
          bucket_id = 'task-media'
          and auth.role() = 'service_role'
        )
    $policy$;
  end if;
end
$$;

-- Step 3: Add storage_path column.
alter table public.task_media
  add column if not exists storage_path text;

-- Step 4: Make content nullable (was NOT NULL) to support metadata-first writes.
alter table public.task_media
  alter column content drop not null;

-- Step 5: Guardrails during the transition period.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_media_payload_source_check'
      and conrelid = 'public.task_media'::regclass
  ) then
    alter table public.task_media
      add constraint task_media_payload_source_check
      check (storage_path is not null or content is not null);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_media_storage_path_not_blank'
      and conrelid = 'public.task_media'::regclass
  ) then
    alter table public.task_media
      add constraint task_media_storage_path_not_blank
      check (storage_path is null or length(btrim(storage_path)) > 0);
  end if;
end
$$;

create unique index if not exists task_media_storage_path_key
  on public.task_media(storage_path)
  where storage_path is not null;

-- Step 6: Legacy bytea rows must be migrated by a one-off script because the
-- actual object bytes live in Supabase Storage rather than in Postgres.
-- See infra/scripts/migrate-task-media-to-storage.mjs.
