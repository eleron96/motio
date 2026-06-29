-- Milestone status is now always derived from the date (the manual "Status"
-- override was removed from the milestone form). Clear any existing overrides
-- so every milestone's status reflects its date: a past date reads as done,
-- the nearest upcoming one as current, the rest as upcoming.
--
-- The status_override column is kept (nullable) for backward compatibility and
-- a clean rollback; it is simply no longer written from the UI.

UPDATE public.milestones
   SET status_override = NULL
 WHERE status_override IS NOT NULL;
