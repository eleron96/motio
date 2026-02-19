create table if not exists public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  done_at timestamptz,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_subtasks_title_not_blank check (length(btrim(title)) > 0),
  constraint task_subtasks_done_consistency check (
    (is_done = true and done_at is not null)
    or (is_done = false and done_at is null)
  )
);

create index if not exists task_subtasks_task_position_idx
  on public.task_subtasks (task_id, position, created_at);

create index if not exists task_subtasks_workspace_task_done_idx
  on public.task_subtasks (workspace_id, task_id, is_done);

create or replace function public.task_subtasks_sync_workspace()
returns trigger as $$
declare
  resolved_workspace_id uuid;
begin
  select workspace_id
  into resolved_workspace_id
  from public.tasks
  where id = new.task_id;

  if resolved_workspace_id is null then
    raise exception 'Task % does not exist', new.task_id;
  end if;

  new.workspace_id := resolved_workspace_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public set row_security = off;

drop trigger if exists task_subtasks_sync_workspace on public.task_subtasks;
create trigger task_subtasks_sync_workspace
  before insert or update of task_id on public.task_subtasks
  for each row execute function public.task_subtasks_sync_workspace();

drop trigger if exists task_subtasks_set_updated_at on public.task_subtasks;
create trigger task_subtasks_set_updated_at
  before update on public.task_subtasks
  for each row execute function public.set_updated_at();

alter table public.task_subtasks enable row level security;

drop policy if exists "workspace members can read task subtasks" on public.task_subtasks;
create policy "workspace members can read task subtasks" on public.task_subtasks
  for select using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace editors can write task subtasks" on public.task_subtasks;
create policy "workspace editors can write task subtasks" on public.task_subtasks
  for insert with check (public.is_workspace_editor(workspace_id));

drop policy if exists "workspace editors can update task subtasks" on public.task_subtasks;
create policy "workspace editors can update task subtasks" on public.task_subtasks
  for update using (public.is_workspace_editor(workspace_id))
  with check (public.is_workspace_editor(workspace_id));

drop policy if exists "workspace editors can delete task subtasks" on public.task_subtasks;
create policy "workspace editors can delete task subtasks" on public.task_subtasks
  for delete using (public.is_workspace_editor(workspace_id));
