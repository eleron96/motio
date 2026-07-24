-- H-2 (High): cross-tenant write via seed_workspace, no membership check.
--
-- seed_workspace (final definition in 0018) is SECURITY DEFINER set
-- row_security = off and was created with NEITHER a grant NOR a revoke, so the
-- implicit PUBLIC execute grant is live: any caller (even anon) can invoke
--   POST /rest/v1/rpc/seed_workspace {"workspace_id":"<any uuid>"}
-- and inject default statuses / task_types / tags / projects (including text
-- from the caller's own user_workspace_templates) into a workspace they do not
-- belong to.
--
-- The only legitimate caller is create_workspace (0001), itself SECURITY DEFINER
-- and owned by the same role; its internal `perform public.seed_workspace(...)`
-- executes by ownership and is unaffected by revoking the client roles. So the
-- revoke fully closes the direct-call vector without breaking workspace creation.
-- Pure grant change — the function body from 0018 is intentionally untouched.

revoke all on function public.seed_workspace(uuid) from public, anon, authenticated;

comment on function public.seed_workspace(uuid) is
  'Seeds default statuses/types/tags/projects for a workspace. SECURITY DEFINER, '
  'called only from create_workspace (by ownership). Do NOT grant to '
  'anon/authenticated: it has no membership check and writes cross-tenant.';
