-- Этап 6.2 — переписываем payload персонального экспорта под человекочитаемый вид.
--
-- Что не так с v1 (см. миграцию 0077): payload собирался через `to_jsonb(t.*)`,
-- то есть в архив попадали голые UUID-ы (`status_id`, `type_id`, `project_id`,
-- `tag_ids`, `assignee_ids`) без расшифровки имён. Пользователь, получивший экспорт,
-- ничего из такого JSON-а сделать не может.
--
-- В v2:
--   * `exportVersion` = 2 (фронту/тестам полезно различать схему).
--   * camelCase ключи во всём payload (`createdAt` вместо `created_at` и т.п.).
--   * Все FK-поля задач разрезолвлены в имена: `status`, `type`, `project`, `tags[]`,
--     `assignees[]` (с `displayName` + `email` исполнителя).
--   * Tasks / comments / activity сгруппированы под workspace, чтобы файл читался
--     сверху вниз как «вот что я делал в этом workspace-е».
--   * Из profile убраны внутренние lifecycle-поля (`status`, `purge_after`,
--     `daily_brief_shown_date`) — пользователю они не нужны.
--   * Notifications уплощены: тип, заголовок задачи, preview коммента, кто триггернул.

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

  -- Вспомогательные списки: workspace-ы пользователя + его assignee-записи.
  -- assignees — отдельная сущность от profiles: для одного user_id может быть
  -- несколько assignee-строк (по одной на workspace).
  select coalesce(array_agg(workspace_id), '{}'::uuid[])
    into v_workspace_ids
    from public.workspace_members
   where user_id = p_user_id;

  select coalesce(array_agg(id), '{}'::uuid[])
    into v_assignee_ids
    from public.assignees
   where user_id = p_user_id;

  select jsonb_build_object(
    'exportVersion', 2,
    'generatedAt', now(),
    'profile', (
      select jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'displayName', p.display_name,
        'avatarUrl', p.avatar_url,
        'locale', p.locale,
        'preferences', p.preferences,
        'createdAt', p.created_at
      )
      from public.profiles p
      where p.id = p_user_id
    ),
    'workspaces', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', wm.workspace_id,
          'name', w.name,
          'role', wm.role,
          'joinedAt', wm.created_at,
          'tasks', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', t.id,
                'title', t.title,
                'description', t.description,
                'priority', t.priority,
                'status', s.name,
                'type', tt.name,
                'project', pr.name,
                'tags', coalesce((
                  select jsonb_agg(tg.name order by tg.name)
                  from public.tags tg
                  where tg.id = any(t.tag_ids)
                ), '[]'::jsonb),
                'assignees', coalesce((
                  -- DISTINCT через подзапрос: убираем дубли, если user попал
                  -- одновременно в `assignee_id` и в `assignee_ids`.
                  select jsonb_agg(asn order by asn->>'displayName')
                  from (
                    select distinct jsonb_build_object(
                      'displayName', coalesce(pf.display_name, a.name),
                      'email', pf.email
                    ) as asn
                    from public.assignees a
                    left join public.profiles pf on pf.id = a.user_id
                    where a.id = any(coalesce(t.assignee_ids, '{}'::uuid[]))
                       or (t.assignee_id is not null and a.id = t.assignee_id)
                  ) deduped
                ), '[]'::jsonb),
                'startDate', t.start_date,
                'endDate', t.end_date,
                'recurrenceGroupId', t.repeat_id,
                'createdAt', t.created_at,
                'updatedAt', t.updated_at
              )
              order by t.start_date, t.created_at
            )
            from public.tasks t
            left join public.statuses s on s.id = t.status_id
            left join public.task_types tt on tt.id = t.type_id
            left join public.projects pr on pr.id = t.project_id
            where t.workspace_id = wm.workspace_id
              and array_length(v_assignee_ids, 1) is not null
              and (t.assignee_id = any(v_assignee_ids) or t.assignee_ids && v_assignee_ids)
          ), '[]'::jsonb),
          'comments', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', c.id,
                'taskId', c.task_id,
                'taskTitle', tk.title,
                'body', c.content,
                'createdAt', c.created_at,
                'updatedAt', c.updated_at
              )
              order by c.created_at
            )
            from public.task_comments c
            left join public.tasks tk on tk.id = c.task_id
            where c.workspace_id = wm.workspace_id
              and c.author_id = p_user_id
              and c.deleted_at is null
          ), '[]'::jsonb),
          'activity', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', a.id,
                'action', a.action,
                'targetLabel', a.target_label,
                'targetEmail', a.target_email,
                'details', a.details,
                'createdAt', a.created_at
              )
              order by a.created_at
            )
            from public.workspace_member_activity a
            where a.workspace_id = wm.workspace_id
              and a.actor_user_id = p_user_id
          ), '[]'::jsonb)
        )
        order by w.name
      )
      from public.workspace_members wm
      left join public.workspaces w on w.id = wm.workspace_id
      where wm.user_id = p_user_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'type', n.type,
          'taskTitle', n.task_title_snapshot,
          'commentPreview', n.comment_preview,
          'actor', case
            when ap.id is null then null
            else jsonb_build_object('displayName', ap.display_name, 'email', ap.email)
          end,
          'createdAt', n.created_at,
          'readAt', n.read_at
        )
        order by n.created_at desc
      )
      from public.user_notifications n
      left join public.profiles ap on ap.id = n.actor_user_id
      where n.recipient_user_id = p_user_id
        and n.deleted_at is null
    ), '[]'::jsonb)
  ) into payload;

  return payload;
end;
$$;

-- Гранты те же, что и в 0077 — переподтверждаем явно на случай rerun.
revoke all on function public._collect_data_export_payload(uuid) from public, authenticated;
grant execute on function public._collect_data_export_payload(uuid) to service_role;

comment on function public._collect_data_export_payload(uuid) is
  'Service-role only. Builds the v2 personal data export payload as JSONB with resolved names instead of raw FK uuids (SECURITY DEFINER to bypass per-table grants).';
