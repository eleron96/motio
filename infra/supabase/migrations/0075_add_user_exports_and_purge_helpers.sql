-- Этап 3 — Edge Functions: поддержка purge и data-export.
-- 1) Приватный bucket `user-exports` (сервис только service_role читает/пишет; юзер качает по signed URL).
-- 2) Helper RPC для account-purge Edge Function:
--      * `_pick_profiles_to_purge(batch_limit)` — пачка PENDING_DELETION c истёкшим purge_after.
--      * `_finalize_profile_purge(target_user_id, email_hash, metadata)` — атомарная анонимизация auth.users + profiles + событие `purged`.
--      * `_log_account_deletion_event(target_user_id, event_type, email_hash, metadata)` — запись promise/failure-событий.
-- 3) Helper RPC для data-export Edge Function:
--      * `_pick_export_request()` — одна pending-заявка (FOR UPDATE SKIP LOCKED, переводит в processing).
--      * `_finalize_export_request(request_id, status, file_path, error)` — помечает ready/failed.
-- Все эти RPC — SECURITY DEFINER, GRANT только service_role (у authenticated доступа нет).

-- ---------------------------------------------------------------------------
-- Storage bucket: user-exports (приватный)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'public'
  ) then
    execute $sql$
      insert into storage.buckets (id, name, public)
      values ('user-exports', 'user-exports', false)
      on conflict (id) do nothing
    $sql$;
  else
    insert into storage.buckets (id, name)
    values ('user-exports', 'user-exports')
    on conflict (id) do nothing;
  end if;
end
$$;

-- RLS: только service_role управляет bucket-ом. Юзер не читает напрямую — только через signed URL от Edge Function.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and policyname = 'Service role manages user-exports'
  ) then
    execute $policy$
      create policy "Service role manages user-exports"
        on storage.objects for all
        using (
          bucket_id = 'user-exports'
          and auth.role() = 'service_role'
        )
        with check (
          bucket_id = 'user-exports'
          and auth.role() = 'service_role'
        )
    $policy$;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Helper RPC: _pick_profiles_to_purge
-- Возвращает до batch_limit профилей, готовых к purge (PENDING_DELETION + purge_after < now()),
-- и их email из auth.users (для хеширования в edge-функции ДО анонимизации).
-- SKIP LOCKED — на случай, если два воркера вдруг запустятся параллельно.
-- ---------------------------------------------------------------------------
create or replace function public._pick_profiles_to_purge(batch_limit integer default 50)
returns table (
  user_id uuid,
  email text,
  purge_after timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if batch_limit is null or batch_limit <= 0 then
    batch_limit := 50;
  end if;

  return query
    select p.id, u.email::text, p.purge_after
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.status = 'PENDING_DELETION'
      and p.purge_after is not null
      and p.purge_after <= now()
    order by p.purge_after asc
    limit batch_limit
    for update of p skip locked;
end;
$$;

revoke all on function public._pick_profiles_to_purge(integer) from public, authenticated;
grant execute on function public._pick_profiles_to_purge(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Helper RPC: _finalize_profile_purge
-- Транзакционно анонимизирует auth.users + profiles и пишет событие `purged`.
-- email_hash рассчитывается снаружи (в edge-функции), т.к. она знает оригинальный email.
-- metadata — произвольный JSON (напр., инфо о Storage/Keycloak операциях).
-- Возвращает итоговый статус профиля (для проверки в тестах).
-- ---------------------------------------------------------------------------
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
         banned_until = 'infinity'::timestamptz
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

revoke all on function public._finalize_profile_purge(uuid, text, jsonb) from public, authenticated;
grant execute on function public._finalize_profile_purge(uuid, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Helper RPC: _log_account_deletion_event
-- Универсальный логгер событий (purge_started / purge_failed / и т.д.) —
-- используется edge-функцией для фиксации промежуточных шагов.
-- ---------------------------------------------------------------------------
create or replace function public._log_account_deletion_event(
  target_user_id uuid,
  event_type text,
  email_hash text default null,
  metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if target_user_id is null then
    raise exception 'account_deletion_event_missing_user_id';
  end if;

  if event_type is null or length(trim(event_type)) = 0 then
    raise exception 'account_deletion_event_missing_type';
  end if;

  insert into public.account_deletion_events (user_id, email_hash, event_type, metadata)
  values (target_user_id, email_hash, event_type, coalesce(metadata, '{}'::jsonb))
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public._log_account_deletion_event(uuid, text, text, jsonb) from public, authenticated;
grant execute on function public._log_account_deletion_event(uuid, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Helper RPC: _pick_export_request
-- Берёт одну pending-заявку (FIFO), переводит её в processing, возвращает детали.
-- FOR UPDATE SKIP LOCKED — защита от параллельных воркеров.
-- ---------------------------------------------------------------------------
create or replace function public._pick_export_request()
returns table (
  request_id uuid,
  user_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  picked_id uuid;
  picked_user uuid;
  picked_created timestamptz;
begin
  select r.id, r.user_id, r.created_at
    into picked_id, picked_user, picked_created
  from public.data_export_requests r
  where r.status = 'pending'
  order by r.created_at asc
  limit 1
  for update skip locked;

  if picked_id is null then
    return;
  end if;

  update public.data_export_requests
     set status = 'processing',
         started_at = now()
   where id = picked_id;

  return query select picked_id, picked_user, picked_created;
end;
$$;

revoke all on function public._pick_export_request() from public, authenticated;
grant execute on function public._pick_export_request() to service_role;

-- ---------------------------------------------------------------------------
-- Helper RPC: _finalize_export_request
-- Помечает заявку ready / failed / expired с соответствующими полями.
-- Для ready — file_path обязателен, ready_at / expires_at выставляются автоматически.
-- Для failed — error идёт в metadata.error.
-- ---------------------------------------------------------------------------
create or replace function public._finalize_export_request(
  request_id uuid,
  new_status text,
  file_path text default null,
  error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_statuses constant text[] := array['ready', 'failed', 'expired'];
  current_request public.data_export_requests%rowtype;
  download_ttl constant interval := interval '24 hours';
begin
  if request_id is null then
    raise exception 'data_export_finalize_missing_request_id';
  end if;

  if new_status is null or not (new_status = any(allowed_statuses)) then
    raise exception 'data_export_finalize_invalid_status';
  end if;

  select * into current_request
  from public.data_export_requests
  where id = request_id
  for update;

  if not found then
    raise exception 'data_export_finalize_request_not_found';
  end if;

  if new_status = 'ready' then
    if file_path is null or length(trim(file_path)) = 0 then
      raise exception 'data_export_finalize_missing_file_path';
    end if;

    update public.data_export_requests
       set status = 'ready',
           file_path = _finalize_export_request.file_path,
           ready_at = now(),
           expires_at = now() + download_ttl,
           error_message = null
     where id = request_id;
  elsif new_status = 'failed' then
    update public.data_export_requests
       set status = 'failed',
           error_message = coalesce(_finalize_export_request.error_message, 'unknown')
     where id = request_id;
  else
    update public.data_export_requests
       set status = 'expired',
           file_path = null
     where id = request_id;
  end if;

  return jsonb_build_object(
    'request_id', request_id,
    'status', new_status
  );
end;
$$;

revoke all on function public._finalize_export_request(uuid, text, text, text) from public, authenticated;
grant execute on function public._finalize_export_request(uuid, text, text, text) to service_role;

comment on function public._pick_profiles_to_purge(integer) is
  'Service-role only. Returns up to N profiles in PENDING_DELETION with expired purge_after (locked FOR UPDATE SKIP LOCKED).';
comment on function public._finalize_profile_purge(uuid, text, jsonb) is
  'Service-role only. Anonymizes auth.users + profiles and writes `purged` audit event. Idempotent guard on current status.';
comment on function public._log_account_deletion_event(uuid, text, text, jsonb) is
  'Service-role only. Appends audit event (purge_started / purge_failed / etc.).';
comment on function public._pick_export_request() is
  'Service-role only. FIFO-picks one pending data_export_requests row and marks it processing.';
comment on function public._finalize_export_request(uuid, text, text, text) is
  'Service-role only. Transitions a data_export_requests row to ready/failed/expired.';
