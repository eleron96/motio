-- Lock down get_media_usage_bytes (introduced in 0065).
--
-- The function is SECURITY DEFINER and runs as its owner (the migration
-- superuser), so it bypasses the service-role-only RLS lockdown on task_media
-- from 0038. It was created WITHOUT revoking the implicit PUBLIC execute grant
-- that Postgres/Supabase hand to anon + authenticated, and without a membership
-- guard — so anyone (even anon) who knows a workspace_id or owner_id UUID could
-- read that entity's total media byte-size, cross-tenant.
--
-- The only legitimate caller is the task-media edge function, which runs under
-- service_role (supabaseAdmin). So we drop every non-service grant, matching the
-- default-deny posture already used for the sensitive helpers in 0075-0077/0091.
-- We also re-declare the function with `set search_path = public` — standard
-- SECURITY DEFINER hardening that 0065 omitted.

create or replace function public.get_media_usage_bytes(
  p_column text,
  p_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case p_column
      when 'owner_id'     then (select sum(byte_size) from public.task_media where owner_id     = p_id)
      when 'workspace_id' then (select sum(byte_size) from public.task_media where workspace_id = p_id)
    end,
    0
  );
$$;

revoke all    on function public.get_media_usage_bytes(text, uuid) from public, anon, authenticated;
grant  execute on function public.get_media_usage_bytes(text, uuid) to service_role;

comment on function public.get_media_usage_bytes(text, uuid) is
  'Total media byte-size for an owner/workspace. SECURITY DEFINER, service_role only '
  '(edge function). Do NOT grant to anon/authenticated: it bypasses task_media RLS.';
