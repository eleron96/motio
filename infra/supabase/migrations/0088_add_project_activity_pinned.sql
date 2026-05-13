-- Pin / "favorite" support for project notes (formerly «Активность»).
-- A pinned note sorts to the top of the feed for everyone viewing the
-- project — matches the per-project tracking pattern but at the row level
-- instead of the (user, project) join level. Default false so all existing
-- notes keep their current order.

ALTER TABLE public.project_activity
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_project_activity_pinned
  ON public.project_activity (project_id, pinned, created_at DESC)
  WHERE pinned = true;
