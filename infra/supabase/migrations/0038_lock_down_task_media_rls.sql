-- task_media stores raw binary content. It must never be readable/writable via PostgREST (anon/authenticated).
-- Edge Functions use the service role key and should be the only access path.

alter table public.task_media enable row level security;

drop policy if exists "service role can manage task media" on public.task_media;
create policy "service role can manage task media" on public.task_media
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

