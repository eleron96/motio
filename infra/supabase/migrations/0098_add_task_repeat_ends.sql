-- Persist the recurrence "ends" mode (never / on / after) for a repeat series.
--
-- Until now the mode was reverse-engineered from the materialized task rows,
-- which always read a multi-task series as "after N". That made it impossible
-- to switch a counted series (e.g. "weekly x14") back to "never": the choice had
-- nowhere to live and was recomputed to "after N" on the next open.
--
-- Only the mode is stored. count/until stay derived from the actual rows on
-- purpose — deleting a single occurrence must not leave a stale stored count.
--
-- Nullable, no default: existing series stay NULL and the task panel falls back
-- to the old inference, so nothing changes for already-created recurring tasks.

alter table public.tasks
  add column if not exists repeat_ends text;
