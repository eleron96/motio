-- Deleting a workspace failed as soon as it held real work. Every path hit it:
-- the owner deleting a workspace (delete_workspace), account deletion that
-- deletes the person's workspaces (request_account_deletion) and the admin
-- console.
--
-- The cascade from workspaces reaches its tables in a fixed order: projects and
-- assignees before tasks. Projects set tasks.project_id to null, assignees set
-- tasks.assignee_id to null, and the strip-from-tasks triggers of assignees and
-- tags (0108) rewrite assignee_ids / tag_ids. So a task with a project and an
-- assignee, two assignees, or an assignee and a tag is updated twice while the
-- workspace row is already gone. The second update of a row in one transaction
-- makes Postgres re-check tasks_workspace_id_fkey, which fails, and the whole
-- delete is rolled back.
--
-- Deleting the workspace's tasks first, while the workspace still exists,
-- leaves the cascade nothing to update. One BEFORE DELETE trigger covers every
-- path that deletes a workspace, present and future.

create or replace function public.delete_workspace_tasks_first()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  delete from public.tasks where workspace_id = old.id;
  return old;
end;
$$;

-- A trigger function only; nobody should call it directly.
revoke all on function public.delete_workspace_tasks_first() from public, anon, authenticated;

drop trigger if exists workspaces_delete_tasks_first on public.workspaces;
create trigger workspaces_delete_tasks_first
  before delete on public.workspaces
  for each row execute function public.delete_workspace_tasks_first();
