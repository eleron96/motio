-- Restricts whole-workspace destruction to the OWNER, matching the owner-only
-- member-removal model established in 0034. Previously any admin could destroy
-- the workspace (and cascade-delete all its data) via delete_workspace, while
-- being unable to remove a single member — an inconsistent trust boundary.
--
-- delete_workspace (0001_init.sql:420-432) checked only is_workspace_admin().
-- The workspaces DELETE RLS policy (0001_init.sql:245-246) likewise allowed any
-- admin. Both are tightened to owner-only here.
--
-- request_account_deletion (0074) deletes solely-owned workspaces inside a
-- SECURITY DEFINER context (owned by the migration role, RLS-exempt), so it is
-- unaffected by either change.

create or replace function public.delete_workspace(workspace_id uuid)
returns void as $$
begin
  if not exists (
    select 1 from public.workspaces w
    where w.id = delete_workspace.workspace_id
      and w.owner_id = auth.uid()
  ) then
    raise exception 'only the workspace owner can delete the workspace';
  end if;

  delete from public.workspaces where id = delete_workspace.workspace_id;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

grant execute on function public.delete_workspace(uuid) to authenticated;

drop policy if exists "workspace admins can delete" on public.workspaces;
create policy "workspace owners can delete" on public.workspaces
  for delete using (owner_id = auth.uid());
