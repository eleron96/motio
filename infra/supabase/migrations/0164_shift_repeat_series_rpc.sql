-- Move a repeat series in one call.
--
-- Dragging a repeating task with scope "this and following" / "all" sent one
-- UPDATE per occurrence from the client, one after another: on prod most series
-- have 93+ occurrences (max 101), so a drag took seconds, teammates watched the
-- series crawl, and a dropped connection left it half-moved.
--
-- The client still computes the new dates (buildShiftedRepeatTasks, which clamps
-- them) and passes them in; this applies them in one transaction and returns the
-- moved rows. Same shape as rebuild_repeat_series (0107): SECURITY DEFINER with
-- an explicit is_workspace_editor guard, every row scoped to (workspace_id,
-- repeat_id), so it can never touch another workspace or another series.

create or replace function public.shift_repeat_series(
  p_workspace_id uuid,
  p_repeat_id uuid,
  p_rows jsonb
)
returns setof public.tasks
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_workspace_editor(p_workspace_id) then
    raise exception 'not authorized to edit this workspace' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  return query
    with moved as (
      update public.tasks t
      set start_date = (r.value->>'start_date')::date,
          end_date   = (r.value->>'end_date')::date
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
      where t.id = (r.value->>'id')::uuid
        and t.workspace_id = p_workspace_id
        and t.repeat_id = p_repeat_id
      returning t.*
    )
    select * from moved order by start_date, id;
end;
$$;

revoke all on function public.shift_repeat_series(uuid, uuid, jsonb) from public, anon;
grant execute on function public.shift_repeat_series(uuid, uuid, jsonb) to authenticated;

comment on function public.shift_repeat_series(uuid, uuid, jsonb) is
  'Atomically move occurrences of a repeat series to client-computed dates. '
  'Guarded by is_workspace_editor; every row scoped to (workspace_id, repeat_id).';
