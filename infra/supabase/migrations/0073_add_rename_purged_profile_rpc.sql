-- RPC for workspace admins to rename a PURGED profile whose display_name turned
-- out to be offensive or otherwise unwanted. Only admins of a workspace that
-- the purged user was a member of can trigger this.
--
-- display_name is stored globally on profiles (not per-workspace) — renaming
-- updates it everywhere the purged user appears in the admin's workspace, and
-- also anywhere else that user was historically visible. This is a deliberate
-- trade-off (see account-deletion-plan.md, decision #4): simpler schema,
-- good-enough for MVP.

create or replace function public.rename_purged_profile(
  p_target_user_id uuid,
  p_workspace_id uuid,
  p_new_name text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target_status public.account_status;
  v_trimmed text := trim(coalesce(p_new_name, ''));
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if char_length(v_trimmed) < 2 or char_length(v_trimmed) > 40 then
    raise exception 'display name must be 2..40 characters' using errcode = '22023';
  end if;

  -- Caller must be admin of the workspace.
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = v_caller
      and role = 'admin'
  ) then
    raise exception 'not a workspace admin' using errcode = '42501';
  end if;

  -- Target must have been a member of that workspace at some point.
  -- We keep workspace_members rows for PENDING_DELETION / PURGED users, so a
  -- plain existence check suffices.
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_target_user_id
  ) then
    raise exception 'target was never a member of this workspace' using errcode = '42501';
  end if;

  select status into v_target_status
    from public.profiles
    where id = p_target_user_id;

  if v_target_status is distinct from 'PURGED' then
    raise exception 'target profile is not PURGED (status=%)', v_target_status
      using errcode = '42501';
  end if;

  update public.profiles
     set display_name = v_trimmed
   where id = p_target_user_id
     and status = 'PURGED';
end;
$$;

grant execute on function public.rename_purged_profile(uuid, uuid, text) to authenticated;
