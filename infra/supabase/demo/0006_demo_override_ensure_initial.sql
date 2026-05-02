-- Demo project only. Frontend's authStore.fetchWorkspaces() calls
-- ensure_initial_workspace() whenever the signed-in user has no
-- memberships. On prod that creates an empty default workspace; on
-- demo we want it to seed the templated sandbox instead.
--
-- Replacing the function body keeps the existing call sites in
-- src/features/auth/store/authStore.ts working without conditional
-- branches in frontend code.

create or replace function public.ensure_initial_workspace(default_workspace_name text default 'My Workspace')
returns uuid as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- default_workspace_name is intentionally ignored on demo; the seed
  -- function uses its own canonical name so that every visitor sees
  -- the same sandbox label.
  perform default_workspace_name;
  return public.seed_demo_workspace();
end;
$$ language plpgsql security definer set search_path = public, auth set row_security = off;
