-- Workspaces from Keycloak groups (self-hosted installs, opt-in).
--
-- With KEYCLOAK_WORKSPACES_FROM_GROUPS=true a super admin maps a Keycloak group
-- (often one an external sign-in such as Authentik passes on) to a workspace and
-- a role. When someone opens Motio, the admin function's whoami puts them into
-- the workspaces their groups map to. Off by default; motio.nikog.net leaves it
-- off, so neither table is ever written there.
--
-- Pieces:
--   * group_workspace_mappings — group path (as Keycloak shows it, "/Design" or
--     "/Company/Design"), workspace, role. A mapping also covers the subgroups
--     of its group.
--   * group_workspace_grants — the memberships the sync itself created. Only
--     these can be taken away again (KEYCLOAK_WORKSPACES_FROM_GROUPS_REMOVE=true,
--     when the person is no longer in a mapped group); access given by hand or by
--     an invitation is never touched.
-- Both are read and written by the admin Edge Function only: RLS on, no
-- policies, no grants for anon/authenticated (as workspace_api_tokens, 0156).
--
-- Idempotent.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.group_workspace_grants;
--   DROP TABLE IF EXISTS public.group_workspace_mappings;

create table if not exists public.group_workspace_mappings (
  id uuid primary key default gen_random_uuid(),
  group_path text not null check (group_path ~ '^/[^/]' and length(group_path) <= 255),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor', 'admin')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_path, workspace_id)
);

create index if not exists group_workspace_mappings_workspace_idx
  on public.group_workspace_mappings (workspace_id);

create table if not exists public.group_workspace_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create index if not exists group_workspace_grants_workspace_idx
  on public.group_workspace_grants (workspace_id);

alter table public.group_workspace_mappings enable row level security;
alter table public.group_workspace_grants enable row level security;

-- Deployed stands apply migrations as supabase_admin (no default grants), dev
-- and CI as postgres (default grants to anon and authenticated): revoke
-- explicitly so every environment ends up the same.
revoke all on public.group_workspace_mappings from public, anon, authenticated;
revoke all on public.group_workspace_grants from public, anon, authenticated;
grant select, insert, update, delete on public.group_workspace_mappings to service_role;
grant select, insert, update, delete on public.group_workspace_grants to service_role;
