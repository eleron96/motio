-- Немецкий язык интерфейса: третья локаль профиля.
--
-- Что меняется:
--   * profiles.locale принимает 'de' (NULL по-прежнему значит «ещё не выбирал»);
--   * фраза подтверждения удаления аккаунта есть и по-немецки — клиент
--     (DeleteAccountWizard) показывает ту же строку;
--   * стартовые справочники (seed_workspace) и примеры нового пространства
--     (seed_workspace_sample_data) получают немецкую ветку.
--
-- Русские и английские ветки — дословно как в 0142–0144: у существующих
-- пользователей ничего не меняется. Функции пересоздаются целиком
-- (create or replace), права повторяются явно.
--
-- Rollback: вернуть тела функций из 0142/0143/0144 и
--   alter table public.profiles drop constraint profiles_locale_check;
--   alter table public.profiles add constraint profiles_locale_check check (locale in ('en', 'ru'));
--   (предварительно update public.profiles set locale = 'en' where locale = 'de').

alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('en', 'ru', 'de'));

create or replace function public.account_deletion_confirmation_phrase(p_locale text)
returns text
language sql
immutable
as $$
  select case coalesce(p_locale, 'en')
    when 'ru' then 'Я понимаю, что удаляю свой аккаунт навсегда и теряю доступ ко всем рабочим пространствам'
    when 'en' then 'I understand that I am permanently deleting my account and losing access to all workspaces'
    when 'de' then 'Ich verstehe, dass ich mein Konto endgültig lösche und den Zugriff auf alle Arbeitsbereiche verliere'
    else null
  end
$$;

create or replace function public.seed_workspace(workspace_id uuid, p_locale text default 'en')
returns void as $$
declare
  template_statuses jsonb;
  template_task_types jsonb;
  template_tags jsonb;
  lang text;
begin
  lang := case when p_locale in ('ru', 'de') then p_locale else 'en' end;

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
  elsif lang = 'de' then
    insert into public.statuses (workspace_id, name, emoji, color, is_final, is_cancelled)
    values
      (workspace_id, 'Zu erledigen', '📝', '#94a3b8', false, false),
      (workspace_id, 'In Arbeit', '🚧', '#3b82f6', false, false),
      (workspace_id, 'Erledigt', '✅', '#22c55e', true, false),
      (workspace_id, 'Abgebrochen', '🚫', '#ef4444', false, true);
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
  elsif lang = 'de' then
    insert into public.task_types (workspace_id, name, icon)
    values
      (workspace_id, 'Aufgabe', 'CheckSquare'),
      (workspace_id, 'Funktion', 'Sparkles'),
      (workspace_id, 'Fehler', 'Bug'),
      (workspace_id, 'Besprechung', 'Users');
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
  elsif lang = 'de' then
    insert into public.tags (workspace_id, name, color)
    values
      (workspace_id, 'Dringend', '#ef4444'),
      (workspace_id, 'Backend', '#8b5cf6'),
      (workspace_id, 'Frontend', '#3b82f6'),
      (workspace_id, 'Design', '#ec4899');
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

create or replace function public.seed_workspace_sample_data(
  workspace_id uuid,
  p_locale text default 'en'
)
returns void as $$
declare
  lang text;
  status_todo uuid;
  status_doing uuid;
  status_done uuid;
  type_task uuid;
  project_site uuid;
  project_app uuid;
  project_ops uuid;
  person_a uuid;
  person_b uuid;
  person_c uuid;
  today date := current_date;
begin
  lang := case when p_locale in ('ru', 'de') then p_locale else 'en' end;

  -- Примеры кладём только в пустое пространство: если человек уже успел
  -- завести свои задачи, ничего не добавляем.
  if exists (select 1 from public.tasks t where t.workspace_id = seed_workspace_sample_data.workspace_id) then
    return;
  end if;

  select id into status_todo from public.statuses s
    where s.workspace_id = seed_workspace_sample_data.workspace_id
      and not s.is_final and not s.is_cancelled
    order by s.created_at asc limit 1;
  select id into status_doing from public.statuses s
    where s.workspace_id = seed_workspace_sample_data.workspace_id
      and not s.is_final and not s.is_cancelled
    order by s.created_at asc offset 1 limit 1;
  select id into status_done from public.statuses s
    where s.workspace_id = seed_workspace_sample_data.workspace_id and s.is_final
    order by s.created_at asc limit 1;
  select id into type_task from public.task_types tt
    where tt.workspace_id = seed_workspace_sample_data.workspace_id
    order by tt.created_at asc limit 1;

  -- Без справочников (например, пространство создано по пустому шаблону)
  -- задачи вставить не получится: status_id и type_id — NOT NULL.
  if status_todo is null or type_task is null then
    return;
  end if;
  status_doing := coalesce(status_doing, status_todo);
  status_done := coalesce(status_done, status_todo);

  insert into public.projects (workspace_id, name, code, color, is_sample)
  values
    (workspace_id, case lang when 'ru' then 'Сайт компании' when 'de' then 'Firmenwebsite' else 'Company website' end, 'WEB', '#3b82f6', true),
    (workspace_id, case lang when 'ru' then 'Мобильное приложение' when 'de' then 'Mobile App' else 'Mobile app' end, 'APP', '#22c55e', true),
    (workspace_id, case lang when 'ru' then 'Внутренние процессы' when 'de' then 'Interne Abläufe' else 'Internal ops' end, 'OPS', '#f59e0b', true);

  select id into project_site from public.projects p
    where p.workspace_id = seed_workspace_sample_data.workspace_id and p.code = 'WEB' and p.is_sample limit 1;
  select id into project_app from public.projects p
    where p.workspace_id = seed_workspace_sample_data.workspace_id and p.code = 'APP' and p.is_sample limit 1;
  select id into project_ops from public.projects p
    where p.workspace_id = seed_workspace_sample_data.workspace_id and p.code = 'OPS' and p.is_sample limit 1;

  -- Виртуальные коллеги: строки без user_id. Это штатная модель (так же
  -- устроены люди в демо-режиме), приглашений и учётных записей не требует.
  insert into public.assignees (workspace_id, name, is_active, is_sample)
  values
    (workspace_id, case lang when 'ru' then 'Анна Петрова' when 'de' then 'Anna Becker' else 'Anna Peters' end, true, true),
    (workspace_id, case lang when 'ru' then 'Игорь Соколов' when 'de' then 'Jonas Weber' else 'Ivan Sokolov' end, true, true),
    (workspace_id, case lang when 'ru' then 'Мария Ким' when 'de' then 'Maria Kim' else 'Maria Kim' end, true, true);

  select id into person_a from public.assignees a
    where a.workspace_id = seed_workspace_sample_data.workspace_id and a.is_sample
    order by a.created_at asc limit 1;
  select id into person_b from public.assignees a
    where a.workspace_id = seed_workspace_sample_data.workspace_id and a.is_sample
    order by a.created_at asc offset 1 limit 1;
  select id into person_c from public.assignees a
    where a.workspace_id = seed_workspace_sample_data.workspace_id and a.is_sample
    order by a.created_at asc offset 2 limit 1;

  insert into public.tasks (
    workspace_id, title, project_id, assignee_id, assignee_ids,
    start_date, end_date, status_id, type_id, tag_ids, is_sample
  )
  values
    (workspace_id, case lang when 'ru' then 'Собрать требования к главной' when 'de' then 'Anforderungen an die Startseite sammeln' else 'Collect homepage requirements' end,
      project_site, person_a, array[person_a], today - 4, today - 2, status_done, type_task, '{}', true),
    (workspace_id, case lang when 'ru' then 'Прототип главной страницы' when 'de' then 'Prototyp der Startseite' else 'Homepage prototype' end,
      project_site, person_a, array[person_a], today - 1, today + 2, status_doing, type_task, '{}', true),
    (workspace_id, case lang when 'ru' then 'Тексты для раздела «Цены»' when 'de' then 'Texte für die Preisseite' else 'Copy for the pricing page' end,
      project_site, person_c, array[person_c], today + 1, today + 4, status_todo, type_task, '{}', true),
    (workspace_id, case lang when 'ru' then 'Вёрстка главной' when 'de' then 'Startseite umsetzen' else 'Build the homepage' end,
      project_site, person_b, array[person_b], today + 3, today + 8, status_todo, type_task, '{}', true),
    (workspace_id, case lang when 'ru' then 'Экран входа' when 'de' then 'Anmeldebildschirm' else 'Sign-in screen' end,
      project_app, person_b, array[person_b], today - 3, today + 1, status_doing, type_task, '{}', true),
    (workspace_id, case lang when 'ru' then 'Push-уведомления' when 'de' then 'Push-Benachrichtigungen' else 'Push notifications' end,
      project_app, person_b, array[person_b], today + 2, today + 6, status_todo, type_task, '{}', true),
    (workspace_id, case lang when 'ru' then 'Тестирование на iOS' when 'de' then 'Tests unter iOS' else 'Testing on iOS' end,
      project_app, person_c, array[person_c], today + 5, today + 9, status_todo, type_task, '{}', true),
    (workspace_id, case lang when 'ru' then 'Регламент онбординга' when 'de' then 'Onboarding-Leitfaden' else 'Onboarding playbook' end,
      project_ops, person_c, array[person_c], today - 2, today + 3, status_doing, type_task, '{}', true),
    (workspace_id, case lang when 'ru' then 'Ежемесячный отчёт' when 'de' then 'Monatsbericht' else 'Monthly report' end,
      project_ops, person_a, array[person_a], today + 6, today + 7, status_todo, type_task, '{}', true),
    (workspace_id, case lang when 'ru' then 'Планёрка команды' when 'de' then 'Team-Abstimmung' else 'Team sync' end,
      null, person_a, array[person_a], today, today, status_todo, type_task, '{}', true);

  insert into public.milestones (workspace_id, project_id, title, date, is_sample)
  values
    (workspace_id, project_site, case lang when 'ru' then 'Запуск сайта' when 'de' then 'Website-Launch' else 'Website launch' end, today + 10, true),
    (workspace_id, project_app, case lang when 'ru' then 'Релиз в сторах' when 'de' then 'Store-Release' else 'Store release' end, today + 14, true);

end;
$$ language plpgsql security definer set search_path = public set row_security = off;

revoke all on function public.seed_workspace_sample_data(uuid, text) from public;
revoke all on function public.seed_workspace_sample_data(uuid, text) from anon;
revoke all on function public.seed_workspace_sample_data(uuid, text) from authenticated;
