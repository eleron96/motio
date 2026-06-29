-- Hardens workspace ownership against admin -> owner takeover.
--
-- Problem (security audit finding): the workspaces UPDATE RLS policy
-- (0001_init.sql:243-244) only checks is_workspace_admin(id) and cannot
-- constrain WHICH columns change. So any non-owner admin could run
--   update public.workspaces set owner_id = <self>
-- via the normal authenticated client, seize ownership, and then — per the
-- owner-only member-DELETE policy (0034) — evict the real owner. The UI never
-- sends owner_id, so the only protection lived on the client.
--
-- Fix: a BEFORE UPDATE trigger makes owner_id immutable for CLIENT roles
-- (authenticated / anon). Ownership changes only through sanctioned
-- SECURITY DEFINER paths, which execute under the migration owner role (NOT a
-- client role) and therefore pass the guard:
--   * public.transfer_workspace_ownership() — explicit owner-initiated transfer
--     (added here; also reused by the upcoming "leave workspace" flow)
--   * public.request_account_deletion() (0074) — account-deletion heir transfer
--     (untouched: it is SECURITY DEFINER, so current_user is not a client role)
-- transfer_workspace_ownership() additionally sets a transaction-local guard
-- flag as explicit, self-documenting intent and as belt-and-suspenders.

-- ── owner_id immutability guard ──────────────────────────────────
create or replace function public.guard_workspace_owner_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and current_user in ('authenticated', 'anon')
     and coalesce(current_setting('app.allow_owner_change', true), '') <> 'on'
  then
    raise exception 'owner_id is immutable; use transfer_workspace_ownership()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_guard_owner_id on public.workspaces;
create trigger workspaces_guard_owner_id
  before update on public.workspaces
  for each row execute function public.guard_workspace_owner_id();

-- ── sanctioned ownership transfer ────────────────────────────────
create or replace function public.transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner_id uuid
) returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Only the current owner may transfer ownership.
  if not exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = v_caller
  ) then
    raise exception 'only the workspace owner can transfer ownership'
      using errcode = '42501';
  end if;

  if p_new_owner_id is null or p_new_owner_id = v_caller then
    raise exception 'new owner must be a different user' using errcode = '22023';
  end if;

  -- The heir must be an ACTIVE current member of the workspace.
  if not exists (
    select 1
    from public.workspace_members wm
    join public.profiles p on p.id = wm.user_id
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_new_owner_id
      and p.status = 'ACTIVE'
  ) then
    raise exception 'new owner must be an active member of the workspace'
      using errcode = '22023';
  end if;

  -- Authorize the owner_id change for this transaction only.
  perform set_config('app.allow_owner_change', 'on', true);

  update public.workspaces
    set owner_id = p_new_owner_id
    where id = p_workspace_id;

  -- The new owner must be able to administer the workspace.
  update public.workspace_members
    set role = 'admin'
    where workspace_id = p_workspace_id and user_id = p_new_owner_id;
end;
$$;

grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;
