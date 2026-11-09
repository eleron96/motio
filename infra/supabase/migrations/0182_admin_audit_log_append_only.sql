-- The activity log (0181) is append-only for the admin function everywhere.
--
-- 0181 granted service_role SELECT and INSERT. Deployed stands apply migrations
-- as supabase_admin and end up with exactly that; dev and CI apply them as
-- postgres, whose default privileges also hand service_role UPDATE, DELETE and
-- the rest. Take those away so every environment is the same: nothing that
-- talks to the database as the app or its functions can rewrite history.
--
-- Idempotent.
--
-- Rollback: nothing to undo (0181's grants stay).

revoke update, delete, truncate, references, trigger on public.admin_audit_log from service_role;
