-- Phase 2 of account deletion: RPC layer.
-- State-machine transitions live here, in the DB, so they cannot be bypassed
-- by any client. Keycloak / Storage cleanup is a separate concern handled by
-- the purge Edge Function (Phase 3).
--
-- All RPCs in this file are SECURITY DEFINER and read the caller id from
-- auth.uid(). Write access to data_export_requests was revoked from the
-- authenticated role in 0071 precisely so these functions are the only
-- legitimate path.

-- ────────────────────────── constants ──────────────────────────

create or replace function public.account_deletion_grace_days()
returns int
language sql
immutable
as $$
  select 30
$$;

-- Expected confirmation phrase per locale. Adding a new locale = add a
-- branch here + a .po key on the frontend. Case-sensitive match.
create or replace function public.account_deletion_confirmation_phrase(p_locale text)
returns text
language sql
immutable
as $$
  select case p_locale
    when 'ru' then 'Я понимаю, что удаляю свой аккаунт навсегда и теряю доступ ко всем рабочим пространствам'
    when 'en' then 'I understand that I am permanently deleting my account and losing access to all workspaces'
    else null
  end
$$;

-- ────────────────────────── preview ──────────────────────────

-- Categorizes the caller's workspaces into:
--   workspacesRequiringAction — caller is sole admin; user must pick an heir
--     OR delete the workspace. If caller is the sole member, candidates is [].
--   workspacesAutoHandled — no decision needed (either another admin exists
--     or the caller is not an admin). Listed for UI clarity.
--
-- pendingInvitesCount sums invites the caller sent (that will be revoked) and
-- invites sent to the caller (that will also be revoked).
create or replace function public.preview_account_deletion()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_email text;
  v_requiring jsonb;
  v_auto jsonb;
  v_invites_out int;
  v_invites_in int;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = v_caller;

  -- For each workspace the caller is a member of, decide the category.
  with my_workspaces as (
    select w.id, w.name, wm.role as caller_role
      from public.workspaces w
      join public.workspace_members wm on wm.workspace_id = w.id
     where wm.user_id = v_caller
  ),
  admin_counts as (
    select mw.id as workspace_id,
           mw.name,
           mw.caller_role,
           (select count(*)::int
              from public.workspace_members wm2
              join public.profiles p2 on p2.id = wm2.user_id
             where wm2.workspace_id = mw.id
               and wm2.role = 'admin'
               and wm2.user_id <> v_caller
               and p2.status = 'ACTIVE') as other_admins,
           (select count(*)::int
              from public.workspace_members wm3
              join public.profiles p3 on p3.id = wm3.user_id
             where wm3.workspace_id = mw.id
               and wm3.user_id <> v_caller
               and p3.status = 'ACTIVE') as other_members
      from my_workspaces mw
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', ac.workspace_id,
        'name', ac.name,
        'candidates', (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'user_id', wm.user_id,
              'display_name', p.display_name,
              'role', wm.role
            ) order by p.display_name
          ), '[]'::jsonb)
          from public.workspace_members wm
          join public.profiles p on p.id = wm.user_id
          where wm.workspace_id = ac.workspace_id
            and wm.user_id <> v_caller
            and p.status = 'ACTIVE'
        )
      )
    ) filter (where ac.caller_role = 'admin' and ac.other_admins = 0),
    '[]'::jsonb),
    coalesce(jsonb_agg(
      jsonb_build_object('id', ac.workspace_id, 'name', ac.name)
    ) filter (where not (ac.caller_role = 'admin' and ac.other_admins = 0)),
    '[]'::jsonb)
  into v_requiring, v_auto
  from admin_counts ac;

  select count(*)::int into v_invites_out
    from public.workspace_invites
    where invited_by = v_caller
      and revoked_at is null
      and accepted_at is null;

  select count(*)::int into v_invites_in
    from public.workspace_invites
    where email_normalized = lower(trim(v_email))
      and revoked_at is null
      and accepted_at is null;

  return jsonb_build_object(
    'workspacesRequiringAction', v_requiring,
    'workspacesAutoHandled', v_auto,
    'pendingInvitesCount', v_invites_out + v_invites_in,
    'purgeDelayDays', public.account_deletion_grace_days()
  );
end;
$$;

grant execute on function public.preview_account_deletion() to authenticated;

-- ────────────────────────── request ──────────────────────────

-- Format of p_transfers:
--   [
--     {"workspace_id": "<uuid>", "action": "transfer", "new_owner_id": "<uuid>"},
--     {"workspace_id": "<uuid>", "action": "delete"}
--   ]
-- One entry per workspace returned in preview.workspacesRequiringAction.
-- Auto-handled workspaces don't need entries (caller just leaves — their
-- membership row is retained so historical comments continue to resolve).
create or replace function public.request_account_deletion(
  p_transfers jsonb,
  p_confirmation_phrase text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_locale text;
  v_expected text;
  v_status public.account_status;
  v_email text;
  v_grace int := public.account_deletion_grace_days();
  v_purge_after timestamptz;
  v_preview jsonb;
  v_required uuid[];
  v_provided uuid[];
  v_transfer jsonb;
  v_workspace_id uuid;
  v_action text;
  v_new_owner uuid;
  v_transferred int := 0;
  v_deleted int := 0;
  v_revoked_out int := 0;
  v_revoked_in int := 0;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select status, email, locale
    into v_status, v_email, v_locale
    from public.profiles where id = v_caller;

  if v_status is distinct from 'ACTIVE' then
    raise exception 'account is not ACTIVE (current=%)', v_status
      using errcode = '22023';
  end if;

  v_expected := public.account_deletion_confirmation_phrase(v_locale);
  if v_expected is null then
    raise exception 'no confirmation phrase defined for locale=%', v_locale
      using errcode = '22023';
  end if;

  if trim(coalesce(p_confirmation_phrase, '')) <> v_expected then
    raise exception 'confirmation phrase does not match' using errcode = '22023';
  end if;

  -- Validate transfers cover all required workspaces.
  v_preview := public.preview_account_deletion();

  select array_agg((x->>'id')::uuid)
    into v_required
    from jsonb_array_elements(v_preview -> 'workspacesRequiringAction') x;
  v_required := coalesce(v_required, array[]::uuid[]);

  select array_agg((x->>'workspace_id')::uuid)
    into v_provided
    from jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb)) x;
  v_provided := coalesce(v_provided, array[]::uuid[]);

  if exists (
    select 1 from unnest(v_required) r where r <> all(v_provided)
  ) then
    raise exception 'transfers missing for some workspaces requiring action'
      using errcode = '22023';
  end if;

  -- Apply each transfer. We only touch workspaces in v_required — anything
  -- else is ignored (defensive against a malformed client payload).
  for v_transfer in select * from jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb))
  loop
    v_workspace_id := (v_transfer->>'workspace_id')::uuid;
    v_action := v_transfer->>'action';

    if not (v_workspace_id = any(v_required)) then
      continue;
    end if;

    if v_action = 'transfer' then
      v_new_owner := (v_transfer->>'new_owner_id')::uuid;
      if v_new_owner is null then
        raise exception 'transfer entry missing new_owner_id for workspace %',
          v_workspace_id using errcode = '22023';
      end if;
      -- new_owner must be an ACTIVE current member.
      if not exists (
        select 1 from public.workspace_members wm
        join public.profiles p on p.id = wm.user_id
        where wm.workspace_id = v_workspace_id
          and wm.user_id = v_new_owner
          and p.status = 'ACTIVE'
      ) then
        raise exception 'new_owner_id is not an ACTIVE member of workspace %',
          v_workspace_id using errcode = '22023';
      end if;
      update public.workspaces
        set owner_id = v_new_owner
        where id = v_workspace_id;
      update public.workspace_members
        set role = 'admin'
        where workspace_id = v_workspace_id and user_id = v_new_owner;
      v_transferred := v_transferred + 1;
    elsif v_action = 'delete' then
      delete from public.workspaces where id = v_workspace_id;
      v_deleted := v_deleted + 1;
    else
      raise exception 'unknown action % for workspace %', v_action, v_workspace_id
        using errcode = '22023';
    end if;
  end loop;

  -- Revoke invites the caller sent (outgoing).
  with revoked as (
    update public.workspace_invites
       set revoked_at = now(), revoked_reason = 'canceled'
     where invited_by = v_caller
       and revoked_at is null
       and accepted_at is null
     returning 1
  )
  select count(*)::int into v_revoked_out from revoked;

  -- Revoke invites sent to the caller's email (incoming).
  with revoked as (
    update public.workspace_invites
       set revoked_at = now(), revoked_reason = 'canceled'
     where email_normalized = lower(trim(v_email))
       and revoked_at is null
       and accepted_at is null
     returning 1
  )
  select count(*)::int into v_revoked_in from revoked;

  -- Flip the caller's lifecycle state. workspace_members rows are kept so
  -- historical comments/activity continue to resolve the user's display_name
  -- (existing profile-RLS allows that, because they still share membership).
  v_purge_after := now() + make_interval(days => v_grace);
  update public.profiles
     set status = 'PENDING_DELETION',
         status_changed_at = now(),
         purge_after = v_purge_after
   where id = v_caller;

  insert into public.account_deletion_events (user_id, email_hash, event_type, metadata)
  values (
    v_caller,
    encode(extensions.digest(lower(trim(v_email)), 'sha256'), 'hex'),
    'requested',
    jsonb_build_object(
      'transferred_workspaces', v_transferred,
      'deleted_workspaces', v_deleted,
      'revoked_invites_outgoing', v_revoked_out,
      'revoked_invites_incoming', v_revoked_in,
      'purge_after', v_purge_after
    )
  );

  return jsonb_build_object(
    'purge_after', v_purge_after,
    'transferred_workspaces', v_transferred,
    'deleted_workspaces', v_deleted,
    'revoked_invites_outgoing', v_revoked_out,
    'revoked_invites_incoming', v_revoked_in
  );
end;
$$;

grant execute on function public.request_account_deletion(jsonb, text) to authenticated;

-- ────────────────────────── cancel ──────────────────────────

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_status public.account_status;
  v_email text;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select status, email
    into v_status, v_email
    from public.profiles where id = v_caller;

  if v_status is distinct from 'PENDING_DELETION' then
    raise exception 'account is not PENDING_DELETION (current=%)', v_status
      using errcode = '22023';
  end if;

  update public.profiles
     set status = 'ACTIVE',
         status_changed_at = now(),
         purge_after = null
   where id = v_caller;

  insert into public.account_deletion_events (user_id, email_hash, event_type, metadata)
  values (
    v_caller,
    encode(extensions.digest(lower(trim(v_email)), 'sha256'), 'hex'),
    'cancelled',
    '{}'::jsonb
  );
end;
$$;

grant execute on function public.cancel_account_deletion() to authenticated;

-- ────────────────────────── data export ──────────────────────────

-- Rate limit: one request per hour. Failed / expired requests still count
-- (they occupy a slot) — users can always check the status of the latest
-- request via get_data_export_status. If a request is stuck >1h in pending,
-- the user can retry.
create or replace function public.request_data_export()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_status public.account_status;
  v_last_created timestamptz;
  v_min_interval interval := interval '1 hour';
  v_retry_after int;
  v_id uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select status into v_status from public.profiles where id = v_caller;
  -- Exports are allowed while PENDING_DELETION so users can grab their data.
  -- Only PURGED is forbidden (nothing to export).
  if v_status = 'PURGED' then
    raise exception 'account is PURGED' using errcode = '22023';
  end if;

  select created_at into v_last_created
    from public.data_export_requests
    where user_id = v_caller
    order by created_at desc
    limit 1;

  if v_last_created is not null
     and v_last_created > now() - v_min_interval then
    v_retry_after := greatest(
      0,
      extract(epoch from (v_last_created + v_min_interval) - now())::int
    );
    raise exception 'data export rate limit: retry_after=%s', v_retry_after
      using errcode = '22023';
  end if;

  insert into public.data_export_requests (user_id, status)
  values (v_caller, 'pending')
  returning id into v_id;

  return jsonb_build_object(
    'request_id', v_id,
    'status', 'pending'
  );
end;
$$;

grant execute on function public.request_data_export() to authenticated;

create or replace function public.get_data_export_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_row public.data_export_requests%rowtype;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.data_export_requests
    where user_id = v_caller
    order by created_at desc
    limit 1;

  if v_row.id is null then
    return jsonb_build_object('status', 'none');
  end if;

  -- file_path is only exposed when the request is ready. For any other status
  -- we expose just the metadata the UI needs.
  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'created_at', v_row.created_at,
    'ready_at', v_row.ready_at,
    'expires_at', v_row.expires_at,
    'file_path', case when v_row.status = 'ready' then v_row.file_path else null end,
    'error_message', v_row.error_message
  );
end;
$$;

grant execute on function public.get_data_export_status() to authenticated;
