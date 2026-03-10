create or replace function public.prevent_task_comment_identity_update()
returns trigger as $$
begin
  if auth.role() is distinct from 'service_role'
    and current_user not in ('postgres', 'supabase_admin') then
    if new.task_id is distinct from old.task_id then
      raise exception 'task comment task_id cannot be changed';
    end if;

    if new.workspace_id is distinct from old.workspace_id then
      raise exception 'task comment workspace_id cannot be changed';
    end if;

    if new.author_id is distinct from old.author_id then
      raise exception 'task comment author_id cannot be changed';
    end if;

    if new.created_at is distinct from old.created_at then
      raise exception 'task comment created_at cannot be changed';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, auth;

drop trigger if exists task_comments_prevent_identity_update on public.task_comments;
create trigger task_comments_prevent_identity_update
  before update on public.task_comments
  for each row execute function public.prevent_task_comment_identity_update();

drop policy if exists "author or admin can update task comments" on public.task_comments;
create policy "author or admin can update task comments" on public.task_comments
  for update using (
    deleted_at is null
    and (
      author_id = auth.uid()
      or public.is_workspace_admin(workspace_id)
    )
  )
  with check (
    author_id = auth.uid()
    or public.is_workspace_admin(workspace_id)
  );
