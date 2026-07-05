-- Per-workspace workload "capacity": how many tasks per person per day counts as
-- a full (100%) day on the heatmap. NULL means "auto" — the board derives it from
-- the workspace's own recent history (a high percentile of daily load), so the
-- percentage means "how loaded are we vs. what's normal for THIS team", not vs.
-- the busiest day on screen.
--
-- Nullable, no default: additive, and NULL keeps every existing workspace on the
-- auto calibration until an owner sets an explicit number in workspace settings.

alter table public.workspaces
  add column if not exists heatmap_capacity_per_person numeric;
