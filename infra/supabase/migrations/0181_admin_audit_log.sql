-- Admin console → Activity log: what super admins changed, and what the group
-- sync did on its own (workspaces from Keycloak groups).
--
-- Written only by the admin Edge Function (service_role) and by the settings
-- command line (infra/scripts/motio-settings.sh, as supabase_admin); read by
-- the admin function for super admins. RLS on, no policies, no grants for anon
-- or authenticated (as instance_settings, 0176).
--
-- Ids only, no emails or names: those are looked up when the log is read, so
-- the log keeps nothing personal of its own. No foreign keys on purpose: a
-- deleted workspace or account must not take its history with it, nor be held
-- back by it.
--
-- actor_id null = not a person: the group sync, or the command line
-- (details.via says which).
--
-- Idempotent.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.admin_audit_log;

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid,
  action text not null check (action ~ '^[a-zA-Z]+\.[a-zA-Z]+$' and length(action) <= 60),
  workspace_id uuid,
  target_user_id uuid,
  details jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from public, anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;
-- The identity's own sequence, nothing wider.
do $$
begin
  execute format(
    'grant usage, select on sequence %s to service_role',
    pg_get_serial_sequence('public.admin_audit_log', 'id')
  );
end $$;
