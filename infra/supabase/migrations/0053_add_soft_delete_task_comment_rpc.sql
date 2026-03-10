create or replace function public.soft_delete_task_comment(
  target_workspace_id uuid,
  target_comment_id uuid
)
returns boolean
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.task_comments
  set deleted_at = now()
  where id = target_comment_id
    and workspace_id = target_workspace_id
    and deleted_at is null
    and (
      author_id = auth.uid()
      or public.is_workspace_admin(workspace_id)
    );

  return found;
end;
$$ language plpgsql security definer set search_path = public, auth set row_security = off;

grant execute on function public.soft_delete_task_comment(uuid, uuid) to authenticated;
