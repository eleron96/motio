-- Phase 6 (Project Card): per-project activity feed. v1 ships only the
-- `comment` kind — manual journal entries written by team members
-- (matches the «Информация» column from the BIM team's spreadsheet).
-- Future kinds (`milestone_done`, `task_added`, ...) can be added without a
-- schema change; the CHECK constraint stays narrow on purpose so unknown
-- kinds are caught early.

CREATE TABLE IF NOT EXISTS public.project_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  /** Snapshot of display name at insert; survives author purge. */
  author_display_name text NOT NULL,
  kind text NOT NULL DEFAULT 'comment',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_activity_kind_check'
  ) THEN
    ALTER TABLE public.project_activity
      ADD CONSTRAINT project_activity_kind_check
      CHECK (kind IN ('comment'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS project_activity_project_created_idx
  ON public.project_activity (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_activity_workspace_id_idx
  ON public.project_activity (workspace_id);

ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can read project_activity" ON public.project_activity;
DROP POLICY IF EXISTS "workspace editors can write project_activity" ON public.project_activity;
DROP POLICY IF EXISTS "workspace editors can update project_activity" ON public.project_activity;
DROP POLICY IF EXISTS "workspace editors can delete project_activity" ON public.project_activity;

CREATE POLICY "workspace members can read project_activity" ON public.project_activity
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "workspace editors can write project_activity" ON public.project_activity
  FOR INSERT WITH CHECK (public.is_workspace_editor(workspace_id));

CREATE POLICY "workspace editors can update project_activity" ON public.project_activity
  FOR UPDATE USING (public.is_workspace_editor(workspace_id));

CREATE POLICY "workspace editors can delete project_activity" ON public.project_activity
  FOR DELETE USING (public.is_workspace_editor(workspace_id));

CREATE OR REPLACE FUNCTION public.touch_project_activity_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_activity_set_updated_at ON public.project_activity;
CREATE TRIGGER project_activity_set_updated_at
  BEFORE UPDATE ON public.project_activity
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity_updated_at();
