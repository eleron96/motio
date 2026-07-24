-- M-8 (Medium): the workspace_member_activity audit log is forgeable and
-- over-readable.
--   (a) INSERT policy (0050) authorizes admins/owners but does NOT bind
--       actor_user_id to the caller, so an admin can fabricate log rows that
--       attribute an action to another user (repudiation).
--   (b) SELECT policy (0050) is open to any workspace member, so viewer/editor
--       roles can read member_removed rows including target_email (PII of
--       ex-members) that the UI only ever shows to admins.
--
-- Fix: bind the actor to auth.uid() on write, and narrow reads to admins/owners.
-- Use "admin OR owner" (NOT bare is_workspace_admin) for the read: the workspace
-- owner is not necessarily an is_workspace_admin match (0001_init.sql:215-222),
-- so a bare admin check would lock a non-admin owner out of their own log.
--
-- Not-break: every writer already sets actor_user_id to the current user's id
-- (memberActivityRepository.ts via authState.user.id), and there is no
-- DEFINER/service_role writer where auth.uid() would be null; the only reader
-- (WorkspaceMembersPanel) is already gated on isAdmin, and the data-export path
-- reads via a SECURITY DEFINER function that bypasses RLS. So no client change
-- is required.

-- (a) Narrow read to admins or the owner.
drop policy if exists "workspace members can read member activity" on public.workspace_member_activity;
drop policy if exists "workspace admins or owners can read member activity" on public.workspace_member_activity;
create policy "workspace admins or owners can read member activity" on public.workspace_member_activity
  for select using (
    public.is_workspace_admin(workspace_id)
    or exists (
      select 1 from public.workspaces
      where id = workspace_member_activity.workspace_id
        and owner_id = auth.uid()
    )
  );

-- (b) Bind the actor to the caller, keep the admin/owner authorization.
drop policy if exists "workspace admins or owners can write member activity" on public.workspace_member_activity;
create policy "workspace admins or owners can write member activity" on public.workspace_member_activity
  for insert with check (
    actor_user_id = auth.uid()
    and (
      public.is_workspace_admin(workspace_id)
      or exists (
        select 1 from public.workspaces
        where id = workspace_member_activity.workspace_id
          and owner_id = auth.uid()
      )
    )
  );
