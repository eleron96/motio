-- Server settings: switches a super admin flips in Admin → Settings or with
-- `install.sh settings` / `make settings` (infra/scripts/motio-settings.sh).
--
-- The list of settings and their defaults lives in code
-- (infra/supabase/functions/_shared/instanceSettingsRegistry.ts); every default
-- is how Motio works without the setting. This table keeps only what someone
-- changed, so an empty table = Motio as before. motio.nikog.net starts empty.
--
-- Read and written by the admin Edge Function (service_role) and by the CLI
-- (psql as supabase_admin). RLS on, no policies, no grants for anon or
-- authenticated (as workspace_api_tokens, 0156, and group_workspace_mappings,
-- 0174): people get the values that concern the app through whoami.
--
-- updated_by: who changed it in the admin console; null = the command line.
-- No foreign key on purpose: deleting an account must not touch this table.
--
-- Idempotent.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.instance_settings;

create table if not exists public.instance_settings (
  key text primary key check (key ~ '^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)+$' and length(key) <= 100),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.instance_settings enable row level security;

-- Deployed stands apply migrations as supabase_admin (no default grants), dev
-- and CI as postgres (default grants to anon and authenticated): revoke
-- explicitly so every environment ends up the same.
revoke all on public.instance_settings from public, anon, authenticated;
grant select, insert, update, delete on public.instance_settings to service_role;
