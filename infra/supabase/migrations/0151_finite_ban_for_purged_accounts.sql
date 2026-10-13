-- Observed on production 2026-10-13: the admin Users page and the reserve-admin
-- check answered 500 ("Database error finding users") on every call. The first
-- account purge ran the night before, and _finalize_profile_purge (0075) bans
-- the purged auth user with banned_until = 'infinity'. GoTrue (v2.151) cannot
-- scan an infinite timestamp, so GET /admin/users fails for EVERY page as soon
-- as one such row exists. Everything built on listUsers broke with it: the
-- admin user list and user creation, the reserve-admin bootstrap, and workspace
-- invites (they look the invitee up by email the same way). Sign-in is not
-- affected: GoTrue's OAuth flow never lists users.
--
-- Fix:
--   1. Ban purged accounts for 100 years instead of forever: a finite date that
--      GoTrue reads back fine (the same thing its own "ban forever" does).
--   2. Rewrite rows that already hold a non-finite banned_until. '-infinity'
--      means "ban already over", so it becomes NULL.
--   3. Close a grant gap found on the way: 0075 revoked the function from
--      public and authenticated but not from anon, and Supabase's default
--      privileges had granted anon EXECUTE (live ACL showed anon=X). Only the
--      account-purge edge function (service_role) may call it.
--
-- Unchanged: what a purge anonymises, the PENDING_DELETION state check, the
-- 'purged' event.
--
-- Rollback: re-apply the _finalize_profile_purge definition from 0075 (this
-- brings the 500s back as soon as a purge runs).

create or replace function public._finalize_profile_purge(
  target_user_id uuid,
  email_hash text,
  metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  synthetic_email text;
  current_status account_status;
begin
  if target_user_id is null then
    raise exception 'account_purge_missing_user_id';
  end if;

  select status into current_status
  from public.profiles
  where id = target_user_id;

  if current_status is null then
    raise exception 'account_purge_profile_not_found'
      using hint = 'Profile row is missing for target_user_id';
  end if;

  if current_status <> 'PENDING_DELETION' then
    raise exception 'account_purge_invalid_state'
      using hint = format('Profile is in %s, expected PENDING_DELETION', current_status);
  end if;

  synthetic_email := 'deleted-' || target_user_id::text || '@motio.invalid';

  update auth.users
     set email = synthetic_email,
         raw_user_meta_data = '{}'::jsonb,
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
           || jsonb_build_object('purged_at', now()),
         email_confirmed_at = null,
         phone = null,
         phone_confirmed_at = null,
         banned_until = now() + interval '100 years'
   where id = target_user_id;

  update public.profiles
     set status = 'PURGED',
         status_changed_at = now(),
         purge_after = null,
         email = synthetic_email,
         avatar_url = null,
         preferences = '{}'::jsonb
   where id = target_user_id;

  insert into public.account_deletion_events (user_id, email_hash, event_type, metadata)
  values (target_user_id, email_hash, 'purged', coalesce(metadata, '{}'::jsonb));

  return jsonb_build_object(
    'user_id', target_user_id,
    'status', 'PURGED',
    'synthetic_email', synthetic_email
  );
end;
$$;

update auth.users
   set banned_until = case
         when banned_until = '-infinity'::timestamptz then null
         else now() + interval '100 years'
       end
 where banned_until is not null
   and not isfinite(banned_until);

revoke all on function public._finalize_profile_purge(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public._finalize_profile_purge(uuid, text, jsonb) to service_role;
