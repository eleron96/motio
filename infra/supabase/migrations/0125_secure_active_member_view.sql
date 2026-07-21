-- H-1 (High): cross-tenant membership enumeration via v_active_workspace_members.
--
-- The view (0072) was created without security_invoker, so it runs with the
-- privileges of its owner (the migration superuser) and BYPASSES the RLS on the
-- underlying workspace_members / profiles tables. The grant is to `authenticated`
-- only, so this is not an anonymous leak — but ANY authenticated user of ANY
-- tenant can GET /rest/v1/v_active_workspace_members and enumerate the full
-- membership graph (workspace_id, user_id, role, created_at) of EVERY workspace,
-- including who is admin.
--
-- Fix: run the view as the querying user (security_invoker = on). Then the RLS
-- on workspace_members (is_workspace_member) and profiles (shares-a-workspace)
-- applies, so each caller sees only their own workspaces' rows.
--
-- Not-break: the app never queries this view (the members UI reads
-- workspace_members directly), and a legitimate member still sees co-members
-- because base-table RLS grants shared-workspace visibility. ALTER VIEW ... SET
-- keeps the existing grant, so no re-grant is needed.

alter view public.v_active_workspace_members set (security_invoker = on);
