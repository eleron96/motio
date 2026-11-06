-- Attribute task creation and the last actual task edit to the authenticated
-- person, regardless of which client or RPC performed the write. Existing
-- tasks deliberately keep NULL: their historical authors are not known.

alter table public.tasks
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_created_by_fkey'
  ) then
    alter table public.tasks add constraint tasks_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks'::regclass and conname = 'tasks_updated_by_fkey'
  ) then
    alter table public.tasks add constraint tasks_updated_by_fkey
      foreign key (updated_by) references public.profiles(id) on delete set null;
  end if;
end;
$$;

create index if not exists tasks_created_by_idx on public.tasks(created_by)
  where created_by is not null;
create index if not exists tasks_updated_by_idx on public.tasks(updated_by)
  where updated_by is not null;

create or replace function public.set_task_attribution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  metadata_columns text[] := array['created_at', 'updated_at', 'created_by', 'updated_by'];
begin
  if tg_op = 'INSERT' then
    new.created_by := actor_id;
    new.updated_by := actor_id;
    return new;
  end if;

  -- The creator cannot be replaced by a client. Only an FK clearing a
  -- genuinely deleted profile may clear it. The definer lookup is necessary:
  -- profile RLS can hide a former member who still exists.
  if not (
    new.created_by is null and old.created_by is not null
    and not exists (select 1 from public.profiles where id = old.created_by)
  ) then
    new.created_by := old.created_by;
  end if;

  if (to_jsonb(new) - metadata_columns) is distinct from (to_jsonb(old) - metadata_columns) then
    -- A real system edit has no authenticated actor. Clear attribution rather
    -- than crediting the previous person with that change.
    new.updated_by := actor_id;
  else
    -- No-op and metadata-only writes are not edits. In particular, deleting a
    -- profile must clear its FK without claiming that the task was edited.
    if not (
      new.updated_by is null and old.updated_by is not null
      and not exists (select 1 from public.profiles where id = old.updated_by)
    ) then
      new.updated_by := old.updated_by;
    end if;
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

revoke all on function public.set_task_attribution() from public, anon, authenticated;
grant execute on function public.set_task_attribution() to service_role;

-- BEFORE triggers run alphabetically. Inspect the final row after both the
-- timestamp trigger and tasks_validate_assignees (which normalizes the row).
drop trigger if exists tasks_write_attribution on public.tasks;
create trigger tasks_write_attribution
  before insert or update on public.tasks
  for each row execute function public.set_task_attribution();
