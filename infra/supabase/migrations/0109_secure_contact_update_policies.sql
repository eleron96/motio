-- Hygiene pass on the project-card contact tables. Two long-standing debts,
-- no user-visible and no semantic changes:
--
--   1. Explicit GRANT on public.customers. 0085 granted customer_contacts /
--      project_members / project_activity but not customers itself — that
--      grant was applied by hand outside migrations (documented in 0085), so
--      fresh environments provisioned purely from migrations miss it.
--
--   2. Spell out WITH CHECK on the editor UPDATE policies (0020/0081/0082/0084
--      wrote USING only). Semantically a NO-OP: when WITH CHECK is omitted,
--      PostgreSQL applies the USING expression to new rows as well, so an
--      editor could never move a row into a foreign workspace (verified
--      empirically on the test DB). Writing it out matches every other UPDATE
--      policy in this schema (0001, 0003, 0010, 0023, 0040, 0045, ...) and
--      keeps the new-row check pinned if USING ever diverges from it.
--
-- After this, the only public UPDATE policy without an explicit WITH CHECK is
-- "profile owner can update" on public.profiles, where the PK/FK pair to
-- auth.users already blocks identity rewrites. An integration test
-- (tests/integration/contact-update-policies.test.ts) asserts profiles stays
-- the only such exception.
--
-- Rollback: nothing to roll back semantically; re-creating the policies with
-- USING only (original text in 0020/0081/0082/0084) restores the previous
-- catalog state.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;

DROP POLICY IF EXISTS "workspace editors can update customers" ON public.customers;
CREATE POLICY "workspace editors can update customers" ON public.customers
  FOR UPDATE USING (public.is_workspace_editor(workspace_id))
  WITH CHECK (public.is_workspace_editor(workspace_id));

DROP POLICY IF EXISTS "workspace editors can update customer_contacts" ON public.customer_contacts;
CREATE POLICY "workspace editors can update customer_contacts" ON public.customer_contacts
  FOR UPDATE USING (public.is_workspace_editor(workspace_id))
  WITH CHECK (public.is_workspace_editor(workspace_id));

DROP POLICY IF EXISTS "workspace editors can update project_members" ON public.project_members;
CREATE POLICY "workspace editors can update project_members" ON public.project_members
  FOR UPDATE USING (public.is_workspace_editor(workspace_id))
  WITH CHECK (public.is_workspace_editor(workspace_id));

DROP POLICY IF EXISTS "workspace editors can update project_activity" ON public.project_activity;
CREATE POLICY "workspace editors can update project_activity" ON public.project_activity
  FOR UPDATE USING (public.is_workspace_editor(workspace_id))
  WITH CHECK (public.is_workspace_editor(workspace_id));
