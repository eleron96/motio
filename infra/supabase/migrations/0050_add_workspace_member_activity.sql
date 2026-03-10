create table if not exists public.workspace_member_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action text not null check (
    action in (
      'invite_created',
      'member_role_changed',
      'member_group_changed',
      'member_removed',
      'member_status_changed',
      'group_created',
      'group_renamed',
      'group_deleted'
    )
  ),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_label text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_label text,
  target_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workspace_member_activity_workspace_created_at_idx
  on public.workspace_member_activity (workspace_id, created_at desc);

alter table public.workspace_member_activity enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_member_activity'
      and policyname = 'workspace members can read member activity'
  ) then
    create policy "workspace members can read member activity" on public.workspace_member_activity
      for select using (public.is_workspace_member(workspace_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_member_activity'
      and policyname = 'workspace admins or owners can write member activity'
  ) then
    create policy "workspace admins or owners can write member activity" on public.workspace_member_activity
      for insert with check (
        public.is_workspace_admin(workspace_id)
        or exists (
          select 1
          from public.workspaces
          where id = workspace_member_activity.workspace_id
            and owner_id = auth.uid()
        )
      );
  end if;
end $$;
