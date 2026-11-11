-- Task history (0183) is kept for a year. The trigger drops old rows only when
-- their task changes again, so a task nobody touches would keep them forever.
-- purge_task_history() removes every row past the year; backup-service calls it
-- once a night.
--
-- Idempotent.
--
-- Rollback:
--   drop function if exists public.purge_task_history();
--   drop index if exists public.task_history_created_at_idx;

create index if not exists task_history_created_at_idx
  on public.task_history (created_at);

create or replace function public.purge_task_history()
returns integer
language sql
security invoker
set search_path = pg_catalog, public
as $$
  with removed as (
    delete from public.task_history
     where created_at < now() - interval '1 year'
    returning 1
  )
  select count(*)::integer from removed;
$$;

revoke all on function public.purge_task_history() from public, anon, authenticated;
grant execute on function public.purge_task_history() to service_role;
