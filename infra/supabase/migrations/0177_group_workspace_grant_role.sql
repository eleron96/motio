-- Workspaces from Keycloak groups: remember the role a group gave (0174).
--
-- With the server setting groups.syncRoles (Admin → Settings, off by default) a
-- group change also changes the role the group gave — up or down — but only
-- while the member still has exactly that role: a role a workspace admin
-- changed by hand is never touched. That needs the role the sync gave.
--
-- Existing grants get the member's current role (the sync wrote them days ago
-- at most, and only on self-hosted installs that turned the feature on;
-- motio.nikog.net has none). A grant still without one (written by an older
-- function between this migration and the new code) is filled in by the sync.
--
-- Idempotent.
--
-- Rollback:
--   ALTER TABLE public.group_workspace_grants DROP COLUMN IF EXISTS role;

alter table public.group_workspace_grants
  add column if not exists role text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_workspace_grants_role_check'
      and conrelid = 'public.group_workspace_grants'::regclass
  ) then
    alter table public.group_workspace_grants
      add constraint group_workspace_grants_role_check
      check (role is null or role in ('viewer', 'editor', 'admin'));
  end if;
end $$;

update public.group_workspace_grants g
set role = m.role::text
from public.workspace_members m
where g.role is null
  and m.workspace_id = g.workspace_id
  and m.user_id = g.user_id
  and m.role::text in ('viewer', 'editor', 'admin');
