-- Шаблоны нового пространства: человек сам выбирает, с чего начать.
--
-- Раньше каждое первое пространство молча засевалось одним набором примеров
-- («сайт компании, мобильное приложение») и IT-справочниками (Feature / Bug,
-- Backend / Frontend). На проде основная аудитория — проектные бюро и BIM-отделы,
-- и часть живых пространств так и работает с чужими им «Backend / Frontend».
--
-- Теперь новое пространство помечается template_pending, и его владелец видит
-- выбор: несколько шаблонов под способ работы команды или пустое пространство.
-- Содержимое шаблона собирает клиент — на языке интерфейса, через каталоги
-- переводов, — а эта функция атомарно кладёт его в пустое пространство.
-- Справочники шаблона заменяют стартовые, всё остальное помечено is_sample и
-- убирается кнопкой «Убрать примеры», как и прежде.

alter table public.workspaces
  add column if not exists template_pending boolean not null default false;

-- ───────────── новое пространство ждёт выбора шаблона ─────────────

create or replace function public.create_workspace(workspace_name text, p_locale text default 'en')
returns uuid as $$
declare
  new_id uuid;
  has_personal_template boolean;
begin
  if (select count(*) from public.workspace_members where user_id = auth.uid()) >= 5 then
    raise exception 'workspace limit reached for user';
  end if;

  -- Свой шаблон справочников человек настроил сам — его и берём, не спрашивая.
  select exists (
    select 1 from public.user_workspace_templates uwt
    where uwt.user_id = auth.uid()
      and (
        coalesce(jsonb_array_length(uwt.statuses), 0) > 0
        or coalesce(jsonb_array_length(uwt.task_types), 0) > 0
        or coalesce(jsonb_array_length(uwt.tags), 0) > 0
      )
  ) into has_personal_template;

  insert into public.workspaces (name, owner_id, template_pending)
  values (workspace_name, auth.uid(), not has_personal_template)
  returning id into new_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_id, auth.uid(), 'admin');

  perform public.seed_workspace(new_id, p_locale);

  return new_id;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

revoke all on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated;

-- Первое пространство больше не засевается примерами само: их выбирает человек
-- (шаблон). seed_workspace_sample_data остаётся в базе, но не вызывается.
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

revoke all on function public.ensure_initial_workspace(text, text) from public, anon;
grant execute on function public.ensure_initial_workspace(text, text) to authenticated;

-- ───────────────────── применение шаблона ─────────────────────
--
-- p_template — содержимое, собранное клиентом:
--   statuses    [{ key, name, emoji, color, is_final, is_cancelled }]
--   task_types  [{ key, name }]
--   tags        [{ key, name, color }]
--   projects    [{ key, name, code, color }]
--   people      [{ key, name }]                      — вымышленные коллеги
--   tasks       [{ title, project, people[], status, type, tags[],
--                  start, end, repeat, repeat_ends }]  — даты как сдвиг в днях от сегодня
--   milestones  [{ project, title, day }]
--   time_off    [{ person, start, end, note }]
-- Ссылки между частями — по key. Неизвестный ключ — пустая ссылка, а не ошибка.

create or replace function public.apply_workspace_template(p_workspace_id uuid, p_template jsonb)
returns void as $$
declare
  today date := current_date;
  item jsonb;
  new_id uuid;
  status_ids jsonb := '{}'::jsonb;
  type_ids jsonb := '{}'::jsonb;
  tag_ids jsonb := '{}'::jsonb;
  project_ids jsonb := '{}'::jsonb;
  person_ids jsonb := '{}'::jsonb;
  repeat_ids jsonb := '{}'::jsonb;
  fallback_status uuid;
  fallback_type uuid;
  task_people uuid[];
  task_tags uuid[];
  task_repeat uuid;
  start_offset int;
  end_offset int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'not allowed';
  end if;
  if jsonb_typeof(p_template) is distinct from 'object' then
    raise exception 'invalid template';
  end if;

  -- Только в новое пространство, которое ждёт выбора, и только пока в нём
  -- ничего нет: справочники заменяются целиком, и задачам на них ссылаться
  -- нельзя. Повторный вызов (вторая вкладка, двойной клик) ничего не ломает.
  perform 1 from public.workspaces w
    where w.id = p_workspace_id and w.template_pending
    for update;
  if not found then
    raise exception 'workspace is not waiting for a template';
  end if;
  if exists (select 1 from public.tasks t where t.workspace_id = p_workspace_id)
    or exists (select 1 from public.projects p where p.workspace_id = p_workspace_id)
    or exists (select 1 from public.milestones m where m.workspace_id = p_workspace_id) then
    raise exception 'workspace is not empty';
  end if;

  -- Предел на размер: шаблон — это несколько проектов и пара десятков задач,
  -- а не способ залить в базу что угодно.
  if jsonb_array_length(coalesce(p_template->'statuses', '[]')) not between 1 and 12
    or jsonb_array_length(coalesce(p_template->'task_types', '[]')) not between 1 and 12
    or jsonb_array_length(coalesce(p_template->'tags', '[]')) > 20
    or jsonb_array_length(coalesce(p_template->'projects', '[]')) > 12
    or jsonb_array_length(coalesce(p_template->'people', '[]')) > 12
    or jsonb_array_length(coalesce(p_template->'tasks', '[]')) > 150
    or jsonb_array_length(coalesce(p_template->'milestones', '[]')) > 30
    or jsonb_array_length(coalesce(p_template->'time_off', '[]')) > 12 then
    raise exception 'template too large';
  end if;

  -- Справочники: стартовые уступают место шаблонным.
  delete from public.statuses s where s.workspace_id = p_workspace_id;
  delete from public.task_types tt where tt.workspace_id = p_workspace_id;
  delete from public.tags g where g.workspace_id = p_workspace_id;

  for item in select * from jsonb_array_elements(p_template->'statuses') loop
    insert into public.statuses (workspace_id, name, emoji, color, is_final, is_cancelled)
    values (
      p_workspace_id,
      left(trim(item->>'name'), 100),
      nullif(left(trim(coalesce(item->>'emoji', '')), 16), ''),
      coalesce(nullif(item->>'color', ''), '#94a3b8'),
      coalesce((item->>'is_final')::boolean, false) and not coalesce((item->>'is_cancelled')::boolean, false),
      coalesce((item->>'is_cancelled')::boolean, false)
    )
    returning id into new_id;
    status_ids := status_ids || jsonb_build_object(item->>'key', new_id);
  end loop;

  for item in select * from jsonb_array_elements(p_template->'task_types') loop
    insert into public.task_types (workspace_id, name, icon)
    values (p_workspace_id, left(trim(item->>'name'), 100), null)
    returning id into new_id;
    type_ids := type_ids || jsonb_build_object(item->>'key', new_id);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_template->'tags', '[]')) loop
    insert into public.tags (workspace_id, name, color)
    values (p_workspace_id, left(trim(item->>'name'), 100), coalesce(nullif(item->>'color', ''), '#94a3b8'))
    returning id into new_id;
    tag_ids := tag_ids || jsonb_build_object(item->>'key', new_id);
  end loop;

  select s.id into fallback_status from public.statuses s
    where s.workspace_id = p_workspace_id and not s.is_final and not s.is_cancelled
    order by s.created_at asc limit 1;
  if fallback_status is null then
    select s.id into fallback_status from public.statuses s
      where s.workspace_id = p_workspace_id order by s.created_at asc limit 1;
  end if;
  select tt.id into fallback_type from public.task_types tt
    where tt.workspace_id = p_workspace_id order by tt.created_at asc limit 1;

  -- Примеры: всё помечено is_sample и уходит одной кнопкой «Убрать примеры».
  for item in select * from jsonb_array_elements(coalesce(p_template->'projects', '[]')) loop
    insert into public.projects (workspace_id, name, code, color, is_sample)
    values (
      p_workspace_id,
      left(trim(item->>'name'), 200),
      nullif(left(trim(coalesce(item->>'code', '')), 12), ''),
      coalesce(nullif(item->>'color', ''), '#3b82f6'),
      true
    )
    returning id into new_id;
    project_ids := project_ids || jsonb_build_object(item->>'key', new_id);
  end loop;

  -- Вымышленные коллеги — строки без учётной записи, как в демо: приглашений
  -- не требуют и уведомлений не получают.
  for item in select * from jsonb_array_elements(coalesce(p_template->'people', '[]')) loop
    insert into public.assignees (workspace_id, name, is_active, is_sample)
    values (p_workspace_id, left(trim(item->>'name'), 200), true, true)
    returning id into new_id;
    person_ids := person_ids || jsonb_build_object(item->>'key', new_id);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_template->'tasks', '[]')) loop
    start_offset := least(greatest(coalesce((item->>'start')::int, 0), -90), 365);
    end_offset := least(greatest(coalesce((item->>'end')::int, start_offset), start_offset), start_offset + 60);

    task_people := array(
      select (person_ids->>key)::uuid
      from jsonb_array_elements_text(coalesce(item->'people', '[]')) as key
      where person_ids ? key
    );
    task_tags := array(
      select (tag_ids->>key)::uuid
      from jsonb_array_elements_text(coalesce(item->'tags', '[]')) as key
      where tag_ids ? key
    );

    task_repeat := null;
    if nullif(item->>'repeat', '') is not null then
      if not (repeat_ids ? (item->>'repeat')) then
        repeat_ids := repeat_ids || jsonb_build_object(item->>'repeat', gen_random_uuid());
      end if;
      task_repeat := (repeat_ids->>(item->>'repeat'))::uuid;
    end if;

    insert into public.tasks (
      workspace_id, title, project_id, assignee_id, assignee_ids,
      start_date, end_date, status_id, type_id, tag_ids,
      repeat_id, repeat_ends, is_sample
    )
    values (
      p_workspace_id,
      left(trim(item->>'title'), 300),
      (project_ids->>(item->>'project'))::uuid,
      task_people[1],
      task_people,
      today + start_offset,
      today + end_offset,
      coalesce((status_ids->>(item->>'status'))::uuid, fallback_status),
      coalesce((type_ids->>(item->>'type'))::uuid, fallback_type),
      task_tags,
      task_repeat,
      case when task_repeat is null then null
        when item->>'repeat_ends' in ('never', 'on', 'after') then item->>'repeat_ends'
        else 'after' end,
      true
    );
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_template->'milestones', '[]')) loop
    if project_ids ? (item->>'project') then
      insert into public.milestones (workspace_id, project_id, title, date, is_sample)
      values (
        p_workspace_id,
        (project_ids->>(item->>'project'))::uuid,
        left(trim(item->>'title'), 200),
        today + least(greatest(coalesce((item->>'day')::int, 0), -90), 365),
        true
      );
    end if;
  end loop;

  -- Отпуска вымышленных коллег уходят вместе с ними (time_off → assignees
  -- on delete cascade), отдельная метка им не нужна.
  for item in select * from jsonb_array_elements(coalesce(p_template->'time_off', '[]')) loop
    if person_ids ? (item->>'person') then
      start_offset := least(greatest(coalesce((item->>'start')::int, 0), -90), 365);
      end_offset := least(greatest(coalesce((item->>'end')::int, start_offset), start_offset), start_offset + 60);
      insert into public.time_off (workspace_id, assignee_id, start_date, end_date, note)
      values (
        p_workspace_id,
        (person_ids->>(item->>'person'))::uuid,
        today + start_offset,
        today + end_offset,
        nullif(left(trim(coalesce(item->>'note', '')), 200), '')
      );
    end if;
  end loop;

  update public.workspaces set template_pending = false where id = p_workspace_id;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

revoke all on function public.apply_workspace_template(uuid, jsonb) from public, anon;
grant execute on function public.apply_workspace_template(uuid, jsonb) to authenticated;
