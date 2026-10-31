-- Undo of a series move in one call.
--
-- Undoing a series move wrote the old dates back one occurrence at a time,
-- each UPDATE guarded by "only if the dates are still the ones we set" (so a
-- teammate's later change is not overwritten): 93+ requests one after another
-- on a typical prod series. shift_repeat_series (0164) already moves a series
-- in one transaction; this adds the same guard per row, as optional keys:
--
--   {"id", "start_date", "end_date", "expect_start_date", "expect_end_date"}
--
-- A row with expectations is moved only while the task still has exactly
-- those dates; rows without them behave as before, so tabs running an older
-- build keep working. Only the rows actually moved are returned — the caller
-- counts the rest as changed by someone else.

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
        and (r.value->>'expect_start_date' is null
          or t.start_date = (r.value->>'expect_start_date')::date)
        and (r.value->>'expect_end_date' is null
          or t.end_date = (r.value->>'expect_end_date')::date)
      returning t.*
    )
    select * from moved order by start_date, id;
end;
$$;

revoke all on function public.shift_repeat_series(uuid, uuid, jsonb) from public, anon;
grant execute on function public.shift_repeat_series(uuid, uuid, jsonb) to authenticated;

comment on function public.shift_repeat_series(uuid, uuid, jsonb) is
  'Atomically move occurrences of a repeat series to client-computed dates, '
  'optionally only while each still has the expected dates (undo). '
  'Guarded by is_workspace_editor; every row scoped to (workspace_id, repeat_id).';
