-- M-6 (Medium): a user can bypass the guarded account-deletion pipeline by
-- writing profiles.status / purge_after directly, AND the existing email guard
-- (0008) is a silent no-op.
--
-- Root cause (shared): 0008's prevent_profile_email_update was declared
-- SECURITY DEFINER. Inside a DEFINER function current_user is the function
-- OWNER (postgres), so its check `current_user not in ('postgres','supabase_admin')`
-- is ALWAYS false and the guard never fires — profiles.email is currently
-- editable by any authenticated client via a direct PATCH. The correct pattern
-- is the one already used by guard_workspace_owner_id (0093): a SECURITY INVOKER
-- trigger, where current_user reflects the real caller ('authenticated'/'anon'
-- for a client PATCH, 'postgres' inside the legit SECURITY DEFINER RPCs).
--
-- This migration:
--   1. Fixes 0008 by re-declaring the email guard as INVOKER.
--   2. Adds a matching INVOKER guard for the lifecycle columns
--      (status, status_changed_at, purge_after) so a client cannot set
--      status='PENDING_DELETION' / purge_after directly and skip the
--      confirmation phrase + ownership transfer in request_account_deletion().
--
-- Why triggers and not a column-level REVOKE: profiles is owned by postgres and
-- inherits Supabase's default table-level UPDATE grant to anon/authenticated
-- (see 0119). A column-level REVOKE cannot subtract from a still-present
-- table-level grant, so it would be a silent no-op; and re-granting per-column
-- would hand-codify table grants (against this project's convention). The
-- INVOKER triggers are the real, working control.
--
-- Not-break: the client only writes display_name/locale/avatar_url/preferences/
-- *_opt_in/daily_brief_shown_date directly and mutates status/purge_after/email
-- ONLY via SECURITY DEFINER RPCs (request/cancel_account_deletion,
-- _finalize_profile_purge, admin_force_purge_account, handle_user_email_update),
-- all owned by postgres → current_user is not a client role → the guards pass.

-- 1) Fix the broken email guard: DEFINER -> INVOKER (mirror 0093).
create or replace function public.prevent_profile_email_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email is distinct from old.email
     and current_user in ('authenticated', 'anon') then
    raise exception 'profile email cannot be changed';
  end if;
  return new;
end;
$$;

-- Re-create the email-guard trigger explicitly. 0008 created it, but on the live
-- DBs the trigger is absent (verified on the test stand: pg_trigger has no
-- profiles_prevent_email_update even though 0008 is EXECUTED and profiles was
-- never recreated). Re-declaring the INVOKER function alone does nothing if no
-- trigger is bound, so bind it here — idempotent (drop-if-exists + create).
drop trigger if exists profiles_prevent_email_update on public.profiles;
create trigger profiles_prevent_email_update
  before update on public.profiles
  for each row execute function public.prevent_profile_email_update();

-- 2) Guard the account-lifecycle columns the same way.
create or replace function public.prevent_profile_lifecycle_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.status is distinct from old.status
      or new.status_changed_at is distinct from old.status_changed_at
      or new.purge_after is distinct from old.purge_after)
     and current_user in ('authenticated', 'anon') then
    raise exception 'profile lifecycle fields cannot be changed directly';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_lifecycle_update on public.profiles;
create trigger profiles_prevent_lifecycle_update
  before update on public.profiles
  for each row execute function public.prevent_profile_lifecycle_update();
