-- Defense-in-depth for invite-authority staleness: when a member is removed
-- from a workspace, or demoted out of the 'admin' role, proactively revoke any
-- still-pending invites THEY created for that workspace. Otherwise an invite
-- minted by a since-removed/demoted admin stays redeemable for its TTL and
-- would grant the role that admin chose (the edge function also re-checks the
-- inviter at ACCEPT time; this trigger closes the window proactively and covers
-- every code path, including direct service-role writes).
--
-- Mirrors what request_account_deletion (0074) already does on self-delete.
-- Uses revoked_reason = 'canceled' to satisfy the existing
-- workspace_invites_revoked_reason_check constraint (0032).

create or replace function public.revoke_invites_on_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    update public.workspace_invites
       set revoked_at = now(), revoked_reason = 'canceled'
     where workspace_id = old.workspace_id
       and invited_by = old.user_id
       and accepted_at is null
       and revoked_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists workspace_members_revoke_invites on public.workspace_members;
create trigger workspace_members_revoke_invites
  after update or delete on public.workspace_members
  for each row execute function public.revoke_invites_on_member_change();
