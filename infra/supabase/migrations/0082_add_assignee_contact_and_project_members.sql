-- Phase 4 (Project Card): assignees gain optional email/phone, and a new
-- `project_members` table records explicit per-project team membership
-- (independent of who happens to be on a task). RLS mirrors `customer_contacts`
-- from migration 0081.

ALTER TABLE public.assignees
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL REFERENCES public.assignees(id) ON DELETE CASCADE,
  role text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_members_unique_per_project
  ON public.project_members (project_id, assignee_id);
CREATE INDEX IF NOT EXISTS project_members_workspace_id_idx
  ON public.project_members (workspace_id);
CREATE INDEX IF NOT EXISTS project_members_project_id_idx
  ON public.project_members (project_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace members can read project_members" ON public.project_members;
DROP POLICY IF EXISTS "workspace editors can write project_members" ON public.project_members;
DROP POLICY IF EXISTS "workspace editors can update project_members" ON public.project_members;
DROP POLICY IF EXISTS "workspace editors can delete project_members" ON public.project_members;

CREATE POLICY "workspace members can read project_members" ON public.project_members
  FOR SELECT USING (public.is_workspace_member(workspace_id));

CREATE POLICY "workspace editors can write project_members" ON public.project_members
  FOR INSERT WITH CHECK (public.is_workspace_editor(workspace_id));

CREATE POLICY "workspace editors can update project_members" ON public.project_members
  FOR UPDATE USING (public.is_workspace_editor(workspace_id));

CREATE POLICY "workspace editors can delete project_members" ON public.project_members
  FOR DELETE USING (public.is_workspace_editor(workspace_id));

CREATE OR REPLACE FUNCTION public.touch_project_members_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_members_set_updated_at ON public.project_members;
CREATE TRIGGER project_members_set_updated_at
  BEFORE UPDATE ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_members_updated_at();
