-- Этап 6.1 — post-deploy фиксы data-export.
-- 1) `_collect_data_export_payload(p_user_id)` — SECURITY DEFINER RPC, собирает весь
--    пользовательский срез (profile + workspaces + tasks + comments + activity + notifications)
--    одним SQL-проходом.
--    Мотивация: `service_role` в этом деплое имеет гранты только на ограниченный набор таблиц,
--    поэтому прямые SELECT из Edge Function (на `workspaces`, `tasks`, `task_comments` и т.д.)
--    падают с `permission denied`. SECURITY DEFINER-функция поднимается до `supabase_admin`
--    и может читать всё.
--
-- 2) Уведомление юзера о финальном статусе экспорта. Расширяем `user_notifications`:
--    * колонки `workspace_id` и `task_title_snapshot` становятся NULLable (для account-level
--      ивентов, не привязанных к workspace/task);
--    * CHECK-констрейнт допускает новые типы `'export_ready'` и `'export_failed'`;
--    * RLS-политики обновляются, чтобы юзер видел свои account-level уведомления, даже если
--      `workspace_id IS NULL`;
--    * `_finalize_export_request` при переходе в `ready` / `failed` вставляет запись
--      в `user_notifications` (с `task_title_snapshot` = тип события, `comment_preview` =
--      либо `file_path`, либо `error_message` — для отображения в UI).

-- ---------------------------------------------------------------------------
-- 1) _collect_data_export_payload
-- ---------------------------------------------------------------------------
create or replace function public._collect_data_export_payload(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee_ids uuid[];
  v_workspace_ids uuid[];
  payload jsonb;
begin
  if p_user_id is null then
    raise exception 'data_export_collect_missing_user_id';
  end if;

  -- Собираем вспомогательные списки отдельно, чтобы tasks-подзапрос не тянул
  -- повторно одни и те же строки.
  select coalesce(array_agg(workspace_id), '{}'::uuid[])
    into v_workspace_ids
    from public.workspace_members
   where user_id = p_user_id;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_assignee_ids
    from public.assignees
   where user_id = p_user_id;

  select jsonb_build_object(
    'exportVersion', 1,
    'generatedAt', now(),
    'profile', (
      select to_jsonb(p.*)
        from public.profiles p
       where p.id = p_user_id
    ),
    'workspaces', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'workspaceId', wm.workspace_id,
          'role', wm.role,
          'joinedAt', wm.created_at,
          'workspace', to_jsonb(w.*)
        )
      )
      from public.workspace_members wm
      left join public.workspaces w on w.id = wm.workspace_id
      where wm.user_id = p_user_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(to_jsonb(t.*))
      from public.tasks t
      where t.workspace_id = any(v_workspace_ids)
        and array_length(v_assignee_ids, 1) is not null
        and (t.assignee_id = any(v_assignee_ids) or t.assignee_ids && v_assignee_ids)
    ), '[]'::jsonb),
    'taskComments', coalesce((
      select jsonb_agg(to_jsonb(c.*))
      from public.task_comments c
      where c.author_id = p_user_id
    ), '[]'::jsonb),
    'workspaceActivity', coalesce((
      select jsonb_agg(to_jsonb(a.*))
      from public.workspace_member_activity a
      where a.actor_user_id = p_user_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n.*))
      from public.user_notifications n
      where n.recipient_user_id = p_user_id
        and n.deleted_at is null
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

revoke all on function public._collect_data_export_payload(uuid) from public, authenticated;
grant execute on function public._collect_data_export_payload(uuid) to service_role;

comment on function public._collect_data_export_payload(uuid) is
  'Service-role only. Builds the full personal data export payload as JSONB (SECURITY DEFINER to bypass per-table grants).';

-- ---------------------------------------------------------------------------
-- 2) user_notifications: разрешаем account-level уведомления (без workspace_id / task)
--    + новые типы `export_ready`, `export_failed`.
-- ---------------------------------------------------------------------------
alter table public.user_notifications
  alter column workspace_id drop not null,
  alter column task_title_snapshot drop not null;

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in ('task_assigned', 'comment_mention', 'export_ready', 'export_failed'));

-- Обновляем RLS: для account-level (workspace_id IS NULL) проверяем только recipient.
drop policy if exists "users can read own notifications" on public.user_notifications;
create policy "users can read own notifications" on public.user_notifications
  for select using (
    recipient_user_id = auth.uid()
    and (workspace_id is null or public.is_workspace_member(workspace_id))
  );

drop policy if exists "users can update own notifications" on public.user_notifications;
create policy "users can update own notifications" on public.user_notifications
  for update using (
    recipient_user_id = auth.uid()
    and (workspace_id is null or public.is_workspace_member(workspace_id))
  )
  with check (
    recipient_user_id = auth.uid()
    and (workspace_id is null or public.is_workspace_member(workspace_id))
  );

-- ---------------------------------------------------------------------------
-- 3) _finalize_export_request: дополняем вставкой уведомления.
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
  v_preview text;
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

    -- Уведомляем юзера о готовности экспорта. `task_title_snapshot` используем
    -- как человекочитаемый заголовок, `comment_preview` — как контекстный текст.
    v_preview := 'Your data export is ready to download for 24 hours.';
    insert into public.user_notifications (
      workspace_id, recipient_user_id, actor_user_id, type,
      task_id, task_title_snapshot, task_start_date_snapshot,
      comment_id, comment_preview
    )
    values (
      null, current_request.user_id, null, 'export_ready',
      null, 'Data export ready', null,
      null, v_preview
    );
  elsif new_status = 'failed' then
    update public.data_export_requests
       set status = 'failed',
           error_message = coalesce(_finalize_export_request.error_message, 'unknown')
     where id = request_id;

    v_preview := coalesce(_finalize_export_request.error_message, 'Unknown error');
    if length(v_preview) > 500 then
      v_preview := left(v_preview, 497) || '...';
    end if;
    insert into public.user_notifications (
      workspace_id, recipient_user_id, actor_user_id, type,
      task_id, task_title_snapshot, task_start_date_snapshot,
      comment_id, comment_preview
    )
    values (
      null, current_request.user_id, null, 'export_failed',
      null, 'Data export failed', null,
      null, v_preview
    );
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

comment on function public._finalize_export_request(uuid, text, text, text) is
  'Service-role only. Transitions a data_export_requests row to ready/failed/expired and emits a user_notifications row on ready/failed.';
