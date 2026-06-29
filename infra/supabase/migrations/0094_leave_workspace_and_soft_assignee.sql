-- Lets a member LEAVE a workspace without their tasks losing them, and makes
-- the same task attachment reattach automatically if they are added back.
--
-- Root cause today: remove_member_assignee (0001_init.sql:102-110) HARD-deletes
-- the assignees row when a workspace_members row is removed. tasks.assignee_id
-- (FK on delete set null) goes null and every element in tasks.assignee_ids[]
-- (a uuid[] with no FK) is left dangling. The person vanishes from tasks with
-- no way back.
--
-- The assignees row is the anchor tasks point at. So instead of deleting it on
-- removal we DEACTIVATE it (is_active = false) and keep user_id as the reattach
-- key; when the same user is added again, sync_member_assignee reactivates the
-- SAME row (same assignees.id), so every task that referenced it is restored.
-- This also resolves the dangling-assignee_ids / dashboard ghost-bucket issue.

-- ── reactivate the anchor when a member is (re)added ─────────────
create or replace function public.sync_member_assignee()
returns trigger as $$
declare
  profile_email text;
  profile_name text;
begin
  select email, display_name
    into profile_email, profile_name
  from public.profiles
  where id = new.user_id;

  insert into public.assignees (workspace_id, user_id, name)
  values (new.workspace_id, new.user_id, coalesce(profile_name, profile_email, 'Member'))
  on conflict (workspace_id, user_id)
  do update set name = excluded.name, is_active = true;

  return new;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

-- ── deactivate (do NOT delete) the anchor when a member leaves ───
create or replace function public.remove_member_assignee()
returns trigger as $$
begin
  update public.assignees
     set is_active = false
   where workspace_id = old.workspace_id and user_id = old.user_id;

  return old;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

-- ── self-service leave ──────────────────────────────────────────
-- SECURITY DEFINER because the owner-only workspace_members DELETE policy
-- (0034) forbids a member from deleting their own row. Guards stop a workspace
-- from being orphaned: the owner must transfer ownership (or delete the
-- workspace) first, and a sole admin must promote someone before leaving.
-- Error messages are stable tokens the UI branches on.
create or replace function public.leave_workspace(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_caller uuid := auth.uid();
  v_role public.workspace_role;
  v_other_admins int;
  v_other_members int;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select role into v_role
    from public.workspace_members
   where workspace_id = p_workspace_id and user_id = v_caller;

  if v_role is null then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;

  -- The owner cannot simply leave — transfer ownership or delete the workspace.
  if exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = v_caller
  ) then
    raise exception 'OWNER_MUST_TRANSFER_FIRST' using errcode = '42501';
  end if;

  -- A sole admin with other members remaining must promote someone first, so
  -- the workspace is never left unmanageable. (Counts ACTIVE profiles only.)
  if v_role = 'admin' then
    select
      count(*) filter (where wm.role = 'admin'),
      count(*)
      into v_other_admins, v_other_members
      from public.workspace_members wm
      join public.profiles p on p.id = wm.user_id
     where wm.workspace_id = p_workspace_id
       and wm.user_id <> v_caller
       and p.status = 'ACTIVE';

    if v_other_admins = 0 and v_other_members > 0 then
      raise exception 'SOLE_ADMIN_MUST_PROMOTE_FIRST' using errcode = '42501';
    end if;
  end if;

  -- Removing the membership row fires remove_member_assignee, which now
  -- deactivates (not deletes) the assignee anchor, preserving task attribution.
  delete from public.workspace_members
   where workspace_id = p_workspace_id and user_id = v_caller;
end;
$$;

grant execute on function public.leave_workspace(uuid) to authenticated;
