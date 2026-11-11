-- Task history: who changed what on a task, for the "Updated by" line of the card.
--
-- One row per change of a tracked field: title, dates, status, project,
-- assignees, description. Rows are written only by the trigger below; the app
-- reads them under RLS and can never write or rewrite them.
--
-- Kept small on purpose:
--   * values are ids and dates, resolved to names by the client; the
--     description keeps no text, only a hash, so "edited the description" is all
--     the history says;
--   * edits of the same field by the same person within five minutes fold into
--     one row (first "from", last "to"); dragging a task back where it was
--     removes the row;
--   * rows older than a year are dropped the next time the task changes, and
--     the app does not read past a year either;
--   * creation is not recorded: the card already shows who created the task.
--
-- Idempotent.
--
-- Rollback:
--   drop trigger if exists tasks_record_history on public.tasks;
--   drop function if exists public.record_task_history();
--   drop table if exists public.task_history;

create table if not exists public.task_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null
    check (kind in ('title', 'dates', 'status', 'project', 'assignees', 'description')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_history_task_idx
  on public.task_history (task_id, created_at desc);
create index if not exists task_history_workspace_idx
  on public.task_history (workspace_id);
create index if not exists task_history_actor_idx
  on public.task_history (actor_id) where actor_id is not null;

alter table public.task_history enable row level security;

drop policy if exists task_history_select on public.task_history;
create policy task_history_select on public.task_history
  for select to authenticated
  using (workspace_id in (select public.current_user_workspace_ids()));

-- Read-only for the app in every environment: dev and CI apply migrations as
-- postgres, whose default privileges would otherwise hand out writes too.
revoke all on public.task_history from public, anon, authenticated;
grant select on public.task_history to authenticated;
grant select, insert, update, delete on public.task_history to service_role;

create or replace function public.record_task_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $$
declare
  actor uuid := auth.uid();
  kinds text[] := '{}';
  olds jsonb[] := '{}';
  news jsonb[] := '{}';
  old_assignees uuid[];
  new_assignees uuid[];
  last_row record;
  i int;
begin
  if new.title is distinct from old.title then
    kinds := kinds || 'title'::text;
    olds := olds || jsonb_build_object('v', old.title);
    news := news || jsonb_build_object('v', new.title);
  end if;

  if new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date then
    kinds := kinds || 'dates'::text;
    olds := olds || jsonb_build_object('start', old.start_date, 'end', old.end_date);
    news := news || jsonb_build_object('start', new.start_date, 'end', new.end_date);
  end if;

  if new.status_id is distinct from old.status_id then
    kinds := kinds || 'status'::text;
    olds := olds || jsonb_build_object('v', old.status_id);
    news := news || jsonb_build_object('v', new.status_id);
  end if;

  if new.project_id is distinct from old.project_id then
    kinds := kinds || 'project'::text;
    olds := olds || jsonb_build_object('v', old.project_id);
    news := news || jsonb_build_object('v', new.project_id);
  end if;

  -- The order of assignees carries no meaning: compare them as sets.
  old_assignees := array(select a from unnest(old.assignee_ids) as a order by a);
  new_assignees := array(select a from unnest(new.assignee_ids) as a order by a);
  if new_assignees is distinct from old_assignees then
    kinds := kinds || 'assignees'::text;
    olds := olds || jsonb_build_object('v', to_jsonb(old_assignees));
    news := news || jsonb_build_object('v', to_jsonb(new_assignees));
  end if;

  if new.description is distinct from old.description then
    kinds := kinds || 'description'::text;
    olds := olds || jsonb_build_object('v', md5(coalesce(old.description, '')));
    news := news || jsonb_build_object('v', md5(coalesce(new.description, '')));
  end if;

  if cardinality(kinds) = 0 then
    return null;
  end if;

  for i in 1 .. cardinality(kinds) loop
    select h.id, h.actor_id, h.old_value, h.created_at
      into last_row
      from public.task_history h
     where h.task_id = new.id and h.kind = kinds[i]
     order by h.created_at desc, h.id desc
     limit 1;

    if found
       and actor is not null
       and last_row.actor_id is not distinct from actor
       and last_row.created_at > now() - interval '5 minutes' then
      if last_row.old_value is not distinct from news[i] then
        delete from public.task_history where id = last_row.id;
      else
        update public.task_history
           set new_value = news[i], created_at = now()
         where id = last_row.id;
      end if;
    else
      insert into public.task_history (workspace_id, task_id, actor_id, kind, old_value, new_value)
      values (new.workspace_id, new.id, actor, kinds[i], olds[i], news[i]);
    end if;
  end loop;

  delete from public.task_history
   where task_id = new.id and created_at < now() - interval '1 year';

  return null;
end;
$$;

revoke all on function public.record_task_history() from public, anon, authenticated;
grant execute on function public.record_task_history() to service_role;

drop trigger if exists tasks_record_history on public.tasks;
create trigger tasks_record_history
  after update of title, start_date, end_date, status_id, project_id, assignee_ids, description
  on public.tasks
  for each row execute function public.record_task_history();
