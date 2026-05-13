-- Phase 5 (Project Card): milestones gain a free-form `note` (e.g. "Передано
-- заказчику") and a `status_override` that overrides the date-derived status
-- on the project card timeline. Default behaviour stays the same — both
-- columns are nullable.

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS status_override text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'milestones_status_override_check'
  ) THEN
    ALTER TABLE public.milestones
      ADD CONSTRAINT milestones_status_override_check
      CHECK (status_override IS NULL OR status_override IN ('done', 'current', 'upcoming'));
  END IF;
END$$;
