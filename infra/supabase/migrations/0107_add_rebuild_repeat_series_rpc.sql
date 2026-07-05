-- Atomic rebuild of a repeat series.
--
-- Editing a recurring series used to run as a chain of separate PostgREST calls
-- from the client: N per-row updates, a delete of the tail, an insert of the new
-- occurrences, then a sweep of repeat_ends. A failure or dropped connection in the
-- middle left the series half-rebuilt in the DB (some dates moved, tail deleted,
-- new rows missing) — the client could only resync its own store, not undo the DB.
--
-- This wraps the whole rebuild in one function → one transaction → all-or-nothing.
-- The client still computes the plan (buildRepeatSeriesRebuildPlan) and passes it
-- in; the function just applies it atomically and returns the resulting series so
-- the store can reconcile from the authoritative rows in a single round-trip.
--
-- SECURITY DEFINER + explicit is_workspace_editor guard, and every statement is
-- scoped to (workspace_id, repeat_id) so it can never touch another workspace or
-- another series. New rows clone their columns from the anchor row (the same source
-- the client used), so title/project/assignees/etc. carry over unchanged.

create or replace function public.rebuild_repeat_series(
  p_workspace_id uuid,
  p_repeat_id uuid,
  p_anchor_id uuid,
  p_updates jsonb,
  p_delete_ids uuid[],
  p_creates jsonb,
  p_ends text
)
returns setof public.tasks
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_anchor public.tasks%rowtype;
begin
  if not public.is_workspace_editor(p_workspace_id) then
    raise exception 'not authorized to edit this workspace' using errcode = '42501';
  end if;

  -- The anchor is the source of cloned columns for newly created occurrences and
  -- must belong to this workspace + series.
  select * into v_anchor
  from public.tasks
  where id = p_anchor_id
    and workspace_id = p_workspace_id
    and repeat_id = p_repeat_id;
  if not found then
    raise exception 'anchor task % not found in series %', p_anchor_id, p_repeat_id
      using errcode = 'P0002';
  end if;

  -- 1) Reposition existing rows (keep their ids and per-row duration).
  update public.tasks t
  set start_date = (u.value->>'start_date')::date,
      end_date   = (u.value->>'end_date')::date
  from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) as u
  where t.id = (u.value->>'id')::uuid
    and t.workspace_id = p_workspace_id
    and t.repeat_id = p_repeat_id;

  -- 2) Delete the tail beyond the new occurrence count.
  if p_delete_ids is not null and array_length(p_delete_ids, 1) is not null then
    delete from public.tasks
    where id = any(p_delete_ids)
      and workspace_id = p_workspace_id
      and repeat_id = p_repeat_id;
  end if;

  -- 3) Insert new occurrences, cloning columns from the anchor.
  insert into public.tasks (
    workspace_id, title, project_id, assignee_id, assignee_ids,
    start_date, end_date, status_id, type_id, priority, tag_ids,
    description, repeat_id, repeat_ends
  )
  select
    p_workspace_id, v_anchor.title, v_anchor.project_id, v_anchor.assignee_id, v_anchor.assignee_ids,
    (c.value->>'start_date')::date, (c.value->>'end_date')::date,
    v_anchor.status_id, v_anchor.type_id, v_anchor.priority, v_anchor.tag_ids,
    v_anchor.description, p_repeat_id, p_ends
  from jsonb_array_elements(coalesce(p_creates, '[]'::jsonb)) as c;

  -- 4) Align the chosen end mode across the whole series (never/on can't be
  --    inferred from the rows, so every occupied occurrence must carry it).
  update public.tasks
  set repeat_ends = p_ends
  where workspace_id = p_workspace_id
    and repeat_id = p_repeat_id;

  -- Return the authoritative resulting series for the client to reconcile from.
  return query
    select *
    from public.tasks
    where workspace_id = p_workspace_id
      and repeat_id = p_repeat_id
    order by start_date, id;
end;
$$;

revoke all on function public.rebuild_repeat_series(uuid, uuid, uuid, jsonb, uuid[], jsonb, text) from public, anon;
grant execute on function public.rebuild_repeat_series(uuid, uuid, uuid, jsonb, uuid[], jsonb, text) to authenticated;

comment on function public.rebuild_repeat_series(uuid, uuid, uuid, jsonb, uuid[], jsonb, text) is
  'Atomically rebuild a repeat series (update/delete/insert/sweep in one transaction). '
  'Guarded by is_workspace_editor; every statement scoped to (workspace_id, repeat_id).';
