-- task_comments: stores comments on individual tasks.
-- Comments are tied to a specific task (not copied on repeat).
-- workspace_id is auto-resolved from the task via trigger.

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_display_name_snapshot text not null,
  content text not null,
  mentioned_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint task_comments_content_not_blank check (length(btrim(content)) > 0),
  constraint task_comments_content_length check (length(content) <= 20000)
);

-- Index: fast lookup for a task's comments in chronological order
create index if not exists task_comments_task_created_idx
  on public.task_comments (task_id, created_at asc)
  where deleted_at is null;

-- Index: workspace-level scan for RLS checks
create index if not exists task_comments_workspace_idx
  on public.task_comments (workspace_id);

-- Index: author lookup (e.g. delete-own-comments policy)
create index if not exists task_comments_author_idx
  on public.task_comments (author_id);

-- Auto-resolve workspace_id from the parent task on insert/update
create or replace function public.task_comments_sync_workspace()
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

drop trigger if exists task_comments_sync_workspace on public.task_comments;
create trigger task_comments_sync_workspace
  before insert or update of task_id on public.task_comments
  for each row execute function public.task_comments_sync_workspace();

-- Auto-update updated_at on every UPDATE
drop trigger if exists task_comments_set_updated_at on public.task_comments;
create trigger task_comments_set_updated_at
  before update on public.task_comments
  for each row execute function public.set_updated_at();

-- Row-level security
alter table public.task_comments enable row level security;

-- All workspace members can read non-deleted comments
drop policy if exists "workspace members can read task comments" on public.task_comments;
create policy "workspace members can read task comments" on public.task_comments
  for select using (
    deleted_at is null
    and public.is_workspace_member(workspace_id)
  );

-- Only editors (and above) can create comments; author must be themselves
drop policy if exists "workspace editors can create task comments" on public.task_comments;
create policy "workspace editors can create task comments" on public.task_comments
  for insert with check (
    public.is_workspace_editor(workspace_id)
    and author_id = auth.uid()
  );

-- Authors can edit their own comments; admins can edit any comment in the workspace
drop policy if exists "author or admin can update task comments" on public.task_comments;
create policy "author or admin can update task comments" on public.task_comments
  for update using (
    deleted_at is null
    and (
      author_id = auth.uid()
      or public.is_workspace_admin(workspace_id)
    )
  )
  with check (
    deleted_at is null
    and (
      author_id = auth.uid()
      or public.is_workspace_admin(workspace_id)
    )
  );

-- Soft-delete: authors and admins can set deleted_at
-- We allow UPDATE for the whole row so the application can set deleted_at.
-- No separate DELETE policy is needed since we use soft deletes.
