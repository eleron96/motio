-- M-7 (Medium): any workspace admin can demote the owner's membership row to
-- viewer. workspaces.owner_id itself is immutable (0093) and member removal is
-- owner-only (0034), but the UPDATE policy on workspace_members
-- (0001_init.sql:253, is_workspace_admin) has no owner-row protection. So a
-- rogue/compromised admin can strip the owner's admin role, after which the
-- owner can no longer satisfy is_workspace_admin to restore it via RLS —
-- an owner lock-out.
--
-- Fix: a BEFORE UPDATE trigger on the role column, modeled exactly on the WORKING
-- guard_workspace_owner_id trigger (0093) — SECURITY INVOKER so current_user is
-- the real caller. It blocks a client role from changing the OWNER's membership
-- role; the legitimate SECURITY DEFINER paths that promote an heir to admin
-- (transfer_workspace_ownership 0093, request_account_deletion heir transfer
-- 0074) run as the migration owner (current_user not in authenticated/anon), so
-- they pass untouched.
--
-- Chosen over an RLS `user_id <> owner_id` predicate deliberately: RLS cannot be
-- column-scoped, so it would also block benign updates to the owner's row (e.g.
-- assigning the owner to a member group), silently no-op'ing updateMemberGroup.
-- The trigger fires only when role actually changes, leaving group_id and other
-- columns freely updatable on the owner's row.

create or replace function public.guard_workspace_owner_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated', 'anon')
     and old.user_id = (
       select owner_id from public.workspaces where id = old.workspace_id
     )
  then
    raise exception 'the workspace owner role cannot be changed here; use transfer_workspace_ownership()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_members_guard_owner_role on public.workspace_members;
create trigger workspace_members_guard_owner_role
  before update on public.workspace_members
  for each row execute function public.guard_workspace_owner_role();
