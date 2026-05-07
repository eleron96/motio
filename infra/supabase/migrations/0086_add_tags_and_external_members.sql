-- Phase 7 (Project Card iteration 2):
--   • Free-form `tag` column on customer_contacts and project_members so
--     contacts/team can be grouped by arbitrary labels (e.g. «BIM-менеджер»,
--     «субподрядчик», «ПД»).
--   • Allow `project_members` to point at people who do NOT have a workspace
--     `assignees` row at all — `assignee_id` becomes nullable, and we add
--     `external_*` columns with their basic contact info. A CHECK keeps each
--     row anchored to either an internal assignee or an external person.

ALTER TABLE public.customer_contacts
  ADD COLUMN IF NOT EXISTS tag text;

ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS tag text,
  ADD COLUMN IF NOT EXISTS external_name text,
  ADD COLUMN IF NOT EXISTS external_company text,
  ADD COLUMN IF NOT EXISTS external_email text,
  ADD COLUMN IF NOT EXISTS external_phone text;

ALTER TABLE public.project_members
  ALTER COLUMN assignee_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_members_assignee_or_external_check'
  ) THEN
    ALTER TABLE public.project_members
      ADD CONSTRAINT project_members_assignee_or_external_check
      CHECK (assignee_id IS NOT NULL OR external_name IS NOT NULL);
  END IF;
END$$;
