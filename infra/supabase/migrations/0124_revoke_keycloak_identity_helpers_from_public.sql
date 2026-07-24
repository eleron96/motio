-- C-1 (Critical): anonymous account takeover via link_keycloak_identity.
--
-- Both helpers from 0026 are SECURITY DEFINER set row_security = off, but that
-- migration granted execute only to service_role WITHOUT revoking the implicit
-- PUBLIC execute grant Postgres/Supabase hand to anon + authenticated. So any
-- caller with the anon key could:
--   * link_keycloak_identity — bind an attacker-controlled Keycloak sub to ANY
--     user_id (account takeover), overwrite that user's profiles.email /
--     display_name, and delete their real keycloak identity;
--   * get_keycloak_identity — read the user_id -> keycloak sub mapping for any
--     user (an anonymous enumeration oracle).
--
-- The only legitimate callers are the `admin` and `invite` edge functions, which
-- run under service_role (supabaseAdmin). Revoking PUBLIC/anon/authenticated does
-- NOT touch the explicit service_role grant, so those flows keep working. This
-- matches the default-deny posture already used in 0075-0077 / 0091 / 0105.
-- Pure grant change — the function bodies from 0026 are intentionally untouched.

revoke all     on function public.link_keycloak_identity(uuid, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.link_keycloak_identity(uuid, text, text, text, text) to service_role;

revoke all     on function public.get_keycloak_identity(uuid) from public, anon, authenticated;
grant  execute on function public.get_keycloak_identity(uuid) to service_role;

comment on function public.link_keycloak_identity(uuid, text, text, text, text) is
  'Links a Keycloak identity to a Supabase user. SECURITY DEFINER, service_role '
  'only (admin/invite edge functions). Do NOT grant to anon/authenticated: no '
  'internal caller check, so a client grant = account takeover.';

comment on function public.get_keycloak_identity(uuid) is
  'Returns the Keycloak sub for a user_id. SECURITY DEFINER, service_role only. '
  'Do NOT grant to anon/authenticated: it is a user_id -> sub enumeration oracle.';
