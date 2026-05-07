-- Phase 3-6 follow-up: grant base table privileges on the new project-card
-- tables to the supabase `authenticated` role. RLS policies decide which
-- *rows* a request can see; the role still needs the table-level grant to
-- get past PostgREST in the first place.
--
-- The pre-existing `customers` table had these grants from manual setup
-- (no precedent migration in this repo) — without them the test server
-- returned `permission denied for table customer_contacts` even with the
-- correct RLS policies in place.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_activity   TO authenticated;
