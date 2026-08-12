-- Примеры для нового пространства: живой таймлайн вместо пустого экрана.
--
-- Новичок раньше попадал на пустую сетку, а обучающий тур рассказывал ему про
-- «все задачи на таймлайне», подсвечивая пустоту. Теперь первое пространство
-- наполняется небольшим набором примеров, и человек сразу видит, как выглядит
-- работающий план. В конце тура он решает: оставить примеры или очистить.
--
-- Каждая созданная строка помечена is_sample, поэтому «убрать примеры» — это
-- одно точное удаление, а не догадки по названиям. Без метки отличить пример
-- от настоящей работы было бы нечем: удаление проекта задачи не уносит
-- (tasks.project_id on delete set null), и они остались бы висеть навсегда.

alter table public.projects add column if not exists is_sample boolean not null default false;
alter table public.tasks add column if not exists is_sample boolean not null default false;
alter table public.milestones add column if not exists is_sample boolean not null default false;
alter table public.assignees add column if not exists is_sample boolean not null default false;

create index if not exists projects_workspace_sample_idx
  on public.projects (workspace_id) where is_sample;
create index if not exists tasks_workspace_sample_idx
  on public.tasks (workspace_id) where is_sample;
create index if not exists milestones_workspace_sample_idx
  on public.milestones (workspace_id) where is_sample;
create index if not exists assignees_workspace_sample_idx
  on public.assignees (workspace_id) where is_sample;

-- ────────────────────────── засев примеров ──────────────────────────

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
  lang := case when coalesce(p_locale, 'en') = 'ru' then 'ru' else 'en' end;

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
    (workspace_id, case when lang = 'ru' then 'Сайт компании' else 'Company website' end, 'WEB', '#3b82f6', true),
    (workspace_id, case when lang = 'ru' then 'Мобильное приложение' else 'Mobile app' end, 'APP', '#22c55e', true),
    (workspace_id, case when lang = 'ru' then 'Внутренние процессы' else 'Internal ops' end, 'OPS', '#f59e0b', true);

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
    (workspace_id, case when lang = 'ru' then 'Анна Петрова' else 'Anna Peters' end, true, true),
    (workspace_id, case when lang = 'ru' then 'Игорь Соколов' else 'Ivan Sokolov' end, true, true),
    (workspace_id, case when lang = 'ru' then 'Мария Ким' else 'Maria Kim' end, true, true);

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
    (workspace_id, case when lang = 'ru' then 'Собрать требования к главной' else 'Collect homepage requirements' end,
      project_site, person_a, array[person_a], today - 4, today - 2, status_done, type_task, '{}', true),
    (workspace_id, case when lang = 'ru' then 'Прототип главной страницы' else 'Homepage prototype' end,
      project_site, person_a, array[person_a], today - 1, today + 2, status_doing, type_task, '{}', true),
    (workspace_id, case when lang = 'ru' then 'Тексты для раздела «Цены»' else 'Copy for the pricing page' end,
      project_site, person_c, array[person_c], today + 1, today + 4, status_todo, type_task, '{}', true),
    (workspace_id, case when lang = 'ru' then 'Вёрстка главной' else 'Build the homepage' end,
      project_site, person_b, array[person_b], today + 3, today + 8, status_todo, type_task, '{}', true),
    (workspace_id, case when lang = 'ru' then 'Экран входа' else 'Sign-in screen' end,
      project_app, person_b, array[person_b], today - 3, today + 1, status_doing, type_task, '{}', true),
    (workspace_id, case when lang = 'ru' then 'Push-уведомления' else 'Push notifications' end,
      project_app, person_b, array[person_b], today + 2, today + 6, status_todo, type_task, '{}', true),
    (workspace_id, case when lang = 'ru' then 'Тестирование на iOS' else 'Testing on iOS' end,
      project_app, person_c, array[person_c], today + 5, today + 9, status_todo, type_task, '{}', true),
    (workspace_id, case when lang = 'ru' then 'Регламент онбординга' else 'Onboarding playbook' end,
      project_ops, person_c, array[person_c], today - 2, today + 3, status_doing, type_task, '{}', true),
    (workspace_id, case when lang = 'ru' then 'Ежемесячный отчёт' else 'Monthly report' end,
      project_ops, person_a, array[person_a], today + 6, today + 7, status_todo, type_task, '{}', true),
    (workspace_id, case when lang = 'ru' then 'Планёрка команды' else 'Team sync' end,
      null, person_a, array[person_a], today, today, status_todo, type_task, '{}', true);

  insert into public.milestones (workspace_id, project_id, title, date, is_sample)
  values
    (workspace_id, project_site, case when lang = 'ru' then 'Запуск сайта' else 'Website launch' end, today + 10, true),
    (workspace_id, project_app, case when lang = 'ru' then 'Релиз в сторах' else 'Store release' end, today + 14, true);

end;
$$ language plpgsql security definer set search_path = public set row_security = off;

revoke all on function public.seed_workspace_sample_data(uuid, text) from public;
revoke all on function public.seed_workspace_sample_data(uuid, text) from anon;
revoke all on function public.seed_workspace_sample_data(uuid, text) from authenticated;

-- ────────────────────────── очистка примеров ──────────────────────────

create or replace function public.clear_workspace_sample_data(workspace_id uuid)
returns void as $$
begin
  if not public.is_workspace_admin(workspace_id) then
    raise exception 'not allowed';
  end if;

  -- Порядок важен: задачи удаляем раньше проектов и людей, иначе они просто
  -- потеряют проект/исполнителя и останутся на таймлайне сиротами.
  delete from public.tasks t
    where t.workspace_id = clear_workspace_sample_data.workspace_id and t.is_sample;
  delete from public.milestones m
    where m.workspace_id = clear_workspace_sample_data.workspace_id and m.is_sample;
  delete from public.projects p
    where p.workspace_id = clear_workspace_sample_data.workspace_id and p.is_sample;
  delete from public.assignees a
    where a.workspace_id = clear_workspace_sample_data.workspace_id and a.is_sample;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

grant execute on function public.clear_workspace_sample_data(uuid) to authenticated;

-- ────────────── первое пространство получает примеры ──────────────

create or replace function public.ensure_initial_workspace(
  default_workspace_name text default 'My Workspace',
  p_locale text default 'en'
)
returns uuid as $$
declare
  existing_workspace_id uuid;
  normalized_name text;
  created_id uuid;
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

  created_id := public.create_workspace(normalized_name, p_locale);
  -- Примеры — только для самого первого пространства. Второе и последующие
  -- человек создаёт осознанно, там пустота и есть ожидаемый результат.
  perform public.seed_workspace_sample_data(created_id, p_locale);
  return created_id;
end;
$$ language plpgsql security definer set search_path = public, auth set row_security = off;

grant execute on function public.ensure_initial_workspace(text, text) to authenticated;
