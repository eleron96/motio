-- Make the workload heatmap an opt-in, experimental feature: off by default.
--
-- It was introduced default-on ("a base board for every workspace"); the owner
-- has since decided it should be experimental and disabled until explicitly turned
-- on in workspace settings. Flip the column default to false AND reset existing
-- rows to off so the board only shows where an owner opts in.

alter table public.workspaces
  alter column heatmap_enabled set default false;

update public.workspaces
  set heatmap_enabled = false
  where heatmap_enabled;
