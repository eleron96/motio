-- Let a milestone opt out of the department workload heatmap.
--
-- The heatmap pins a small crew around every milestone's date, but not every
-- milestone is a real delivery that occupies the team — some are just markers
-- (a review checkpoint, an internal note). This flag lets the owner drop such a
-- milestone from the load math without deleting it: the chip still shows on the
-- timeline and the heatmap, it just no longer adds to the day's percentage.
--
-- NOT NULL DEFAULT TRUE, so every existing milestone keeps counting exactly as
-- before — the change is purely additive and nothing shifts until someone
-- unticks the box.
--
-- Rollback: ALTER TABLE public.milestones DROP COLUMN include_in_workload;

alter table public.milestones
  add column if not exists include_in_workload boolean not null default true;
