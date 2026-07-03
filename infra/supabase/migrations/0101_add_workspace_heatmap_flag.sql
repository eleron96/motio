-- Per-workspace switch for the workload heatmap board.
--
-- The heatmap is a built-in "department load" view on the dashboard page. It is
-- meant to be on by default for every workspace ("базовый борд"), while still
-- letting an owner/admin turn it off in workspace settings.
--
-- NOT NULL with default true so the column is fully additive: existing rows get
-- the flag set to true on backfill and nothing about current behaviour changes.
-- The UI is additionally gated behind an env feature flag, so shipping this
-- column ahead of the UI is inert.

alter table public.workspaces
  add column if not exists heatmap_enabled boolean not null default true;
