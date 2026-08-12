-- clear_workspace_sample_data (0144) was created with a grant to authenticated
-- but no revoke, so the implicit PUBLIC execute grant stayed live and anon could
-- call it too. The function fails closed — is_workspace_admin() rejects a caller
-- without auth.uid() — so nothing was exposed, but a SECURITY DEFINER function
-- that runs with row_security = off should never be reachable by a role that has
-- no business calling it. Making the grant explicit is also what the CI guard
-- asks for: every definer function is either revoked or consciously allowlisted.
--
-- Pure grant change — the function body from 0144 is intentionally untouched.
-- Revoking from PUBLIC also drops the inherited right of every role, so the
-- legitimate callers are granted back explicitly.

revoke all on function public.clear_workspace_sample_data(uuid) from public, anon;

grant execute on function public.clear_workspace_sample_data(uuid) to authenticated;
grant execute on function public.clear_workspace_sample_data(uuid) to service_role;

comment on function public.clear_workspace_sample_data(uuid) is
  'Deletes the is_sample rows of a workspace. SECURITY DEFINER with '
  'row_security = off, gated by is_workspace_admin(). Callable by workspace '
  'admins from settings and from the end of the onboarding tour. Do NOT grant '
  'to anon.';
