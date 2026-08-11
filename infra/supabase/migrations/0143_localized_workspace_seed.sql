-- Стартовый набор нового пространства: на языке пользователя и без выдуманных
-- проектов.
--
-- Что было не так:
--   * справочники создавались только по-английски (плюс один русский статус
--     «Отменена» — смесь языков в одном списке);
--   * вместе с ними вставлялись четыре несуществующих проекта (Website
--     Redesign, Mobile App, Marketing Campaign, Backend API) — при полностью
--     пустом таймлайне. Человек получал чужие проекты и ноль задач.
--
-- Теперь язык приходит параметром (профиль на этот момент может быть ещё не
-- дописан — воркспейс создаётся параллельно с загрузкой профиля), а проекты не
-- создаются вовсе: примеры добавляются отдельным осознанным шагом.
--
-- Личный шаблон пользователя (user_workspace_templates), как и раньше,
-- побеждает встроенный набор.

drop function if exists public.seed_workspace(uuid);

create or replace function public.seed_workspace(workspace_id uuid, p_locale text default 'en')
returns void as $$
declare
  template_statuses jsonb;
  template_task_types jsonb;
  template_tags jsonb;
  lang text;
begin
  lang := case when coalesce(p_locale, 'en') = 'ru' then 'ru' else 'en' end;

  select statuses, task_types, tags
    into template_statuses, template_task_types, template_tags
  from public.user_workspace_templates
  where user_id = auth.uid();

  if coalesce(jsonb_array_length(template_statuses), 0) > 0 then
    insert into public.statuses (workspace_id, name, emoji, color, is_final, is_cancelled)
    select workspace_id,
      trim(name),
      nullif(emoji, ''),
      coalesce(color, '#94a3b8'),
      coalesce(is_final, false) and not coalesce(is_cancelled, false),
      coalesce(is_cancelled, false)
    from jsonb_to_recordset(template_statuses)
      as status_item(name text, emoji text, color text, is_final boolean, is_cancelled boolean)
    where name is not null and length(trim(name)) > 0;
  elsif lang = 'ru' then
    insert into public.statuses (workspace_id, name, emoji, color, is_final, is_cancelled)
    values
      (workspace_id, 'К выполнению', '📝', '#94a3b8', false, false),
      (workspace_id, 'В работе', '🚧', '#3b82f6', false, false),
      (workspace_id, 'Готово', '✅', '#22c55e', true, false),
      (workspace_id, 'Отменена', '🚫', '#ef4444', false, true);
  else
    insert into public.statuses (workspace_id, name, emoji, color, is_final, is_cancelled)
    values
      (workspace_id, 'To Do', '📝', '#94a3b8', false, false),
      (workspace_id, 'In Progress', '🚧', '#3b82f6', false, false),
      (workspace_id, 'Done', '✅', '#22c55e', true, false),
      (workspace_id, 'Cancelled', '🚫', '#ef4444', false, true);
  end if;

  if coalesce(jsonb_array_length(template_task_types), 0) > 0 then
    insert into public.task_types (workspace_id, name, icon)
    select workspace_id,
      trim(name),
      icon
    from jsonb_to_recordset(template_task_types)
      as type_item(name text, icon text)
    where name is not null and length(trim(name)) > 0;
  elsif lang = 'ru' then
    insert into public.task_types (workspace_id, name, icon)
    values
      (workspace_id, 'Задача', 'CheckSquare'),
      (workspace_id, 'Доработка', 'Sparkles'),
      (workspace_id, 'Ошибка', 'Bug'),
      (workspace_id, 'Встреча', 'Users');
  else
    insert into public.task_types (workspace_id, name, icon)
    values
      (workspace_id, 'Task', 'CheckSquare'),
      (workspace_id, 'Feature', 'Sparkles'),
      (workspace_id, 'Bug', 'Bug'),
      (workspace_id, 'Meeting', 'Users');
  end if;

  if coalesce(jsonb_array_length(template_tags), 0) > 0 then
    insert into public.tags (workspace_id, name, color)
    select workspace_id,
      trim(name),
      coalesce(color, '#94a3b8')
    from jsonb_to_recordset(template_tags)
      as tag_item(name text, color text)
    where name is not null and length(trim(name)) > 0;
  elsif lang = 'ru' then
    insert into public.tags (workspace_id, name, color)
    values
      (workspace_id, 'Срочно', '#ef4444'),
      (workspace_id, 'Бэкенд', '#8b5cf6'),
      (workspace_id, 'Фронтенд', '#3b82f6'),
      (workspace_id, 'Дизайн', '#ec4899');
  else
    insert into public.tags (workspace_id, name, color)
    values
      (workspace_id, 'Urgent', '#ef4444'),
      (workspace_id, 'Backend', '#8b5cf6'),
      (workspace_id, 'Frontend', '#3b82f6'),
      (workspace_id, 'Design', '#ec4899');
  end if;

end;
$$ language plpgsql security definer set search_path = public set row_security = off;

-- Как и для прежней сигнатуры (0126): вызывать напрямую нельзя, единственный
-- законный вызывающий — create_workspace.
revoke all on function public.seed_workspace(uuid, text) from public;
revoke all on function public.seed_workspace(uuid, text) from anon;
revoke all on function public.seed_workspace(uuid, text) from authenticated;

drop function if exists public.create_workspace(text);

create or replace function public.create_workspace(workspace_name text, p_locale text default 'en')
returns uuid as $$
declare
  new_id uuid;
begin
  if (select count(*) from public.workspace_members where user_id = auth.uid()) >= 5 then
    raise exception 'workspace limit reached for user';
  end if;

  insert into public.workspaces (name, owner_id)
  values (workspace_name, auth.uid())
  returning id into new_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_id, auth.uid(), 'admin');

  perform public.seed_workspace(new_id, p_locale);

  return new_id;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

grant execute on function public.create_workspace(text, text) to authenticated;

drop function if exists public.ensure_initial_workspace(text);

create or replace function public.ensure_initial_workspace(
  default_workspace_name text default 'My Workspace',
  p_locale text default 'en'
)
returns uuid as $$
declare
  existing_workspace_id uuid;
  normalized_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  normalized_name := nullif(trim(coalesce(default_workspace_name, '')), '');
  if normalized_name is null then
    normalized_name := 'My Workspace';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select wm.workspace_id
    into existing_workspace_id
  from public.workspace_members wm
  where wm.user_id = auth.uid()
  order by wm.created_at asc
  limit 1;

  if existing_workspace_id is not null then
    return existing_workspace_id;
  end if;

  return public.create_workspace(normalized_name, p_locale);
end;
$$ language plpgsql security definer set search_path = public, auth set row_security = off;

grant execute on function public.ensure_initial_workspace(text, text) to authenticated;
