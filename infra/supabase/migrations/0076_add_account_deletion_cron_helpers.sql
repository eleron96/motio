-- Этап 5 — Cron + мониторинг.
-- 1) `_pick_expired_exports` — пачка ready-записей, у которых истёк TTL, с file_path'ами
--    (cron в backup-service удалит файлы в Storage и вызовет _finalize_export_request со 'expired').
-- 2) `_account_deletion_health_check` — summary для алертов (stuck purges / stuck exports).
-- 3) `admin_force_purge_account` — emergency RPC для super_admin, когда cron не справляется
--    (помечает purge_after=now() у конкретного юзера, оставляя всю остальную цепочку cron-у).
--
-- Все helper-RPC (c префиксом `_`) — SECURITY DEFINER, только service_role.
-- admin_force_purge_account — SECURITY DEFINER, доступен authenticated, но внутри проверяет super_admins.

-- ---------------------------------------------------------------------------
-- Расширяем CHECK-констрейнт account_deletion_events.event_type новым значением
-- 'admin_force_purge_requested' — логируется из admin_force_purge_account.
-- ---------------------------------------------------------------------------
alter table public.account_deletion_events
  drop constraint if exists account_deletion_events_event_type_check;

alter table public.account_deletion_events
  add constraint account_deletion_events_event_type_check
  check (event_type in (
    'requested',
    'cancelled',
    'purge_started',
    'purged',
    'purge_failed',
    'admin_force_purge_requested'
  ));

-- ---------------------------------------------------------------------------
-- Helper RPC: _pick_expired_exports
-- Возвращает ready-записи с истёкшим TTL (expires_at < now()) и непустым file_path.
-- Использует FOR UPDATE SKIP LOCKED — параллельные воркеры не конфликтуют.
-- Сам переход в 'expired' делается НЕ здесь — cron удалит файл в Storage и вызовет
-- _finalize_export_request(id, 'expired'). Так делаем потому что Storage недоступен из SQL.
-- ---------------------------------------------------------------------------
create or replace function public._pick_expired_exports(batch_limit integer default 100)
returns table (
  request_id uuid,
  user_id uuid,
  file_path text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if batch_limit is null or batch_limit <= 0 then
    batch_limit := 100;
  end if;

  return query
    select r.id, r.user_id, r.file_path, r.expires_at
    from public.data_export_requests r
    where r.status = 'ready'
      and r.expires_at is not null
      and r.expires_at < now()
      and r.file_path is not null
    order by r.expires_at asc
    limit batch_limit
    for update of r skip locked;
end;
$$;

revoke all on function public._pick_expired_exports(integer) from public, authenticated;
grant execute on function public._pick_expired_exports(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Helper RPC: _account_deletion_health_check
-- Возвращает JSON с количеством зависших задач для алертов.
-- stuck_purges — PENDING_DELETION с purge_after в прошлом (> 1 hour запаса,
--   чтобы не срабатывать сразу после окончания grace period — даём cron-у
--   один тик на обработку).
-- stuck_exports — pending/processing экспорты, которые висят > 30 минут.
-- stuck_expired_files — ready c expires_at в прошлом (cron не отработал).
-- ---------------------------------------------------------------------------
create or replace function public._account_deletion_health_check()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stuck_purges int;
  v_stuck_exports int;
  v_stuck_expired int;
  v_oldest_purge timestamptz;
  v_oldest_export timestamptz;
begin
  select count(*), min(purge_after)
    into v_stuck_purges, v_oldest_purge
    from public.profiles
    where status = 'PENDING_DELETION'
      and purge_after is not null
      and purge_after < now() - interval '1 hour';

  select count(*), min(created_at)
    into v_stuck_exports, v_oldest_export
    from public.data_export_requests
    where status in ('pending', 'processing')
      and created_at < now() - interval '30 minutes';

  select count(*)
    into v_stuck_expired
    from public.data_export_requests
    where status = 'ready'
      and expires_at is not null
      and expires_at < now() - interval '1 hour';

  return jsonb_build_object(
    'stuck_purges', v_stuck_purges,
    'oldest_stuck_purge', v_oldest_purge,
    'stuck_exports', v_stuck_exports,
    'oldest_stuck_export', v_oldest_export,
    'stuck_expired_files', v_stuck_expired,
    'checked_at', now()
  );
end;
$$;

revoke all on function public._account_deletion_health_check() from public, authenticated;
grant execute on function public._account_deletion_health_check() to service_role;

-- ---------------------------------------------------------------------------
-- Admin RPC: admin_force_purge_account
-- Emergency путь: super_admin выставляет purge_after=now() конкретному юзеру,
-- который застрял в PENDING_DELETION (например, cron не смог его обработать и
-- нужно запустить вручную, или требуется urgent purge по запросу поддержки).
-- Логирует событие 'admin_force_purge_requested' в account_deletion_events.
-- Сам purge по-прежнему делает cron + account-purge edge function — этот RPC
-- только "ускоряет" очередь.
-- ---------------------------------------------------------------------------
create or replace function public.admin_force_purge_account(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_super_admin boolean;
  v_current_status public.account_status;
  v_email text;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if target_user_id is null then
    raise exception 'admin_force_purge_missing_user_id' using errcode = '22023';
  end if;

  select exists(select 1 from public.super_admins where user_id = v_caller)
    into v_is_super_admin;

  if not v_is_super_admin then
    raise exception 'admin_force_purge_not_super_admin' using errcode = '42501';
  end if;

  select p.status, u.email::text
    into v_current_status, v_email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = target_user_id;

  if v_current_status is null then
    raise exception 'admin_force_purge_profile_not_found' using errcode = '22023';
  end if;

  if v_current_status <> 'PENDING_DELETION' then
    raise exception 'admin_force_purge_invalid_state: current=%', v_current_status
      using errcode = '22023';
  end if;

  update public.profiles
     set purge_after = now()
   where id = target_user_id;

  insert into public.account_deletion_events (user_id, email_hash, event_type, metadata)
  values (
    target_user_id,
    encode(extensions.digest(lower(trim(coalesce(v_email, ''))), 'sha256'), 'hex'),
    'admin_force_purge_requested',
    jsonb_build_object('forced_by', v_caller)
  );

  return jsonb_build_object(
    'user_id', target_user_id,
    'purge_after', now(),
    'forced_by', v_caller
  );
end;
$$;

grant execute on function public.admin_force_purge_account(uuid) to authenticated;
