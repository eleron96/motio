-- RPC: return comment counts for a batch of task IDs in a single round-trip.
-- Replaces the client-side pattern of splitting task IDs into batches of 75
-- and issuing N separate PostgREST queries.

create or replace function public.task_comment_counts_batch(
  p_workspace_id uuid,
  p_task_ids uuid[]
)
returns table(task_id uuid, comment_count bigint)
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a workspace member';
  end if;

  return query
    select tc.task_id, count(*)::bigint
    from public.task_comments tc
    where tc.workspace_id = p_workspace_id
      and tc.task_id = any(p_task_ids)
      and tc.deleted_at is null
    group by tc.task_id;
end;
$$ language plpgsql security definer set search_path = public, auth set row_security = off;

grant execute on function public.task_comment_counts_batch(uuid, uuid[]) to authenticated;
