-- Phase 2 (Project Card): each project may optionally belong to one workspace
-- MemberGroup (the "owner team" — Юсов / Ладыгина / etc.). When the group is
-- deleted, the project's owner_group_id reverts to NULL while the project
-- itself stays. The composite FK (group_id, workspace_id) mirrors the same
-- pattern already used by workspace_members (see migration 0064).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_group_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_owner_group_id_fkey'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_owner_group_id_fkey
      FOREIGN KEY (owner_group_id, workspace_id)
      REFERENCES public.member_groups (id, workspace_id)
      ON DELETE SET NULL (owner_group_id);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_projects_owner_group_id
  ON public.projects (owner_group_id)
  WHERE owner_group_id IS NOT NULL;
