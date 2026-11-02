-- Выбор шаблона прямо в окне «Создать пространство».
--
-- В 0169 новое пространство ждало шаблона, только если у человека нет своего
-- набора справочников. Теперь шаблон выбирают ещё до создания — и выбор надо
-- уважать: выбрал «Строительство и монтаж» — пространство ждёт именно его,
-- даже если свой набор сохранён; выбрал «Свой набор» — не ждёт ничего.
--
-- p_await_template:
--   null  — как раньше: ждёт шаблона, если своего набора нет (первый вход);
--   true  — ждёт шаблона, который клиент применит следом;
--   false — шаблона не будет, справочники — из своего набора или стартовые.
--
-- Старую двухаргументную функцию удаляем: две перегрузки с умолчаниями
-- PostgREST различить не может. ensure_initial_workspace зовёт
-- create_workspace(name, locale) и попадает в новую с p_await_template = null.

drop function if exists public.create_workspace(text, text);

create or replace function public.create_workspace(
  workspace_name text,
  p_locale text default 'en',
  p_await_template boolean default null
)
returns uuid as $$
declare
  new_id uuid;
  has_personal_template boolean;
begin
  if (select count(*) from public.workspace_members where user_id = auth.uid()) >= 5 then
    raise exception 'workspace limit reached for user';
  end if;

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
  values (workspace_name, auth.uid(), coalesce(p_await_template, not has_personal_template))
  returning id into new_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_id, auth.uid(), 'admin');

  perform public.seed_workspace(new_id, p_locale);

  return new_id;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

revoke all on function public.create_workspace(text, text, boolean) from public, anon;
grant execute on function public.create_workspace(text, text, boolean) to authenticated;
