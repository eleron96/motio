-- Task history: the latest entry of a task outlives the one-year limit.
--
-- After a year the card would still say who last changed the task (that lives on
-- the task itself), but not what they changed. Keep the newest history row of
-- every task for as long as the task exists; everything older than a year
-- behind it still goes.
--
-- Old rows are now dropped in one place, the nightly purge_task_history()
-- (0184). The trigger (0183) no longer deletes them: it cannot know whether the
-- change it is recording will be taken back a minute later, which would leave
-- the task with no entry at all. For the same reason the purge counts a newer
-- row only once it is past the five-minute folding window.
--
-- Idempotent.
--
-- Rollback: re-apply the function bodies from 0183 and 0184.

create or replace function public.purge_task_history()
returns integer
language sql
security invoker
set search_path = pg_catalog, public
as $$
  with removed as (
    delete from public.task_history h
     where h.created_at < now() - interval '1 year'
       and exists (
         select 1 from public.task_history newer
          where newer.task_id = h.task_id
            and (newer.created_at, newer.id) > (h.created_at, h.id)
            and newer.created_at < now() - interval '5 minutes'
       )
    returning 1
  )
  select count(*)::integer from removed;
$$;

revoke all on function public.purge_task_history() from public, anon, authenticated;
grant execute on function public.purge_task_history() to service_role;

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

  return null;
end;
$$;

revoke all on function public.record_task_history() from public, anon, authenticated;
grant execute on function public.record_task_history() to service_role;
